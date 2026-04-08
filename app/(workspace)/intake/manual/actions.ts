"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value === "" ? null : value;
}

function nullableNumber(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAddressKey(input: {
  unparsedAddress: string;
  city: string;
  state: string;
  postalCode: string | null;
  unitNumber: string | null;
}) {
  return [
    input.unparsedAddress,
    input.city,
    input.state,
    input.postalCode,
    input.unitNumber ? `unit ${input.unitNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function createManualPropertyAction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const unparsedAddress = textValue(formData, "unparsed_address");
  const city = textValue(formData, "city");
  const state = textValue(formData, "state");

  if (!unparsedAddress || !city || !state) {
    throw new Error("Address, city, and state are required.");
  }

  const postalCode = nullableText(formData, "postal_code");
  const unitNumber = nullableText(formData, "unit_number");
  const latitude = nullableNumber(formData, "latitude");
  const longitude = nullableNumber(formData, "longitude");
  const importNotes = nullableText(formData, "import_notes");

  // Physical fields
  const propertyType = nullableText(formData, "property_type");
  const levelClass = nullableText(formData, "level_class_standardized");
  const buildingForm = nullableText(formData, "building_form_standardized");
  const attachedRaw = nullableText(formData, "property_attached_yn");
  const propertyAttached = attachedRaw === "yes" ? true : attachedRaw === "no" ? false : null;
  const buildingSqft = nullableNumber(formData, "building_area_total_sqft");
  const aboveGradeSqft = nullableNumber(formData, "above_grade_finished_area_sqft");
  const belowGradeTotal = nullableNumber(formData, "below_grade_total_sqft");
  const belowGradeFinished = nullableNumber(formData, "below_grade_finished_area_sqft");
  const yearBuilt = nullableInteger(formData, "year_built");
  const bedrooms = nullableInteger(formData, "bedrooms_total");
  const bathrooms = nullableNumber(formData, "bathrooms_total");
  const garageSpaces = nullableNumber(formData, "garage_spaces");
  const lotSizeSqft = nullableNumber(formData, "lot_size_sqft");

  const normalizedAddressKey = normalizeAddressKey({
    unparsedAddress,
    city,
    state,
    postalCode,
    unitNumber,
  });

  const addressSlug = slugify(
    [unparsedAddress, city, state, postalCode].filter(Boolean).join(" "),
  );

  // Create import batch record so this appears in the batches table
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source_system: "manual",
      import_profile: "manual_entry",
      file_name: `Manual: ${unparsedAddress}, ${city}`,
      uploaded_by_user_id: user.id,
      row_count: 1,
      total_row_count: 1,
      unique_listing_count: 1,
      unique_property_count: 1,
      file_count: 0,
      import_notes: importNotes,
      status: "complete",
      summary: { source: "manual_entry", address: unparsedAddress, city },
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Failed to create import batch.");
  }

  // Check if this property already exists (e.g. from a prior MLS import)
  const { data: existing } = await supabase
    .from("real_properties")
    .select("id")
    .eq("normalized_address_key", normalizedAddressKey)
    .maybeSingle();

  let propertyId: string;

  if (existing) {
    // Property exists — link it to this manual batch for screening
    const { error: updateError } = await supabase
      .from("real_properties")
      .update({ last_import_batch_id: batch.id })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    propertyId = existing.id;
  } else {
    // Create new property
    const { data: property, error: propertyError } = await supabase
      .from("real_properties")
      .insert({
        unparsed_address: unparsedAddress,
        city,
        state,
        postal_code: postalCode,
        unit_number: unitNumber,
        latitude,
        longitude,
        lot_size_sqft: lotSizeSqft,
        normalized_address_key: normalizedAddressKey,
        address_slug: addressSlug,
        geocode_source: latitude != null && longitude != null ? "manual" : null,
        last_import_batch_id: batch.id,
        data_source: "manual",
      })
      .select("id")
      .single();

    if (propertyError) {
      throw new Error(propertyError.message);
    }

    propertyId = property.id;
  }

  // Create physical record
  const { error: physicalError } = await supabase
    .from("property_physical")
    .upsert({
      real_property_id: propertyId,
      property_type: propertyType,
      level_class_standardized: levelClass,
      building_form_standardized: buildingForm,
      property_attached_yn: propertyAttached,
      building_area_total_sqft: buildingSqft,
      above_grade_finished_area_sqft: aboveGradeSqft,
      below_grade_total_sqft: belowGradeTotal,
      below_grade_finished_area_sqft: belowGradeFinished,
      year_built: yearBuilt,
      bedrooms_total: bedrooms,
      bathrooms_total: bathrooms,
      garage_spaces: garageSpaces,
    });

  if (physicalError) {
    throw new Error(physicalError.message);
  }

  revalidatePath("/intake/imports");
  revalidatePath("/intake/manual");
  revalidatePath("/admin/properties");
  redirect(`/intake/manual?created=1&batch=${batch.id}`);
}
