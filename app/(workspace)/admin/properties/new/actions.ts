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

export async function createPropertyAction(formData: FormData) {
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
    throw new Error("Unparsed address, city, and state are required.");
  }

  const postalCode = nullableText(formData, "postal_code");
  const unitNumber = nullableText(formData, "unit_number");
  const latitude = nullableNumber(formData, "latitude");
  const longitude = nullableNumber(formData, "longitude");

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
      normalized_address_key: normalizedAddressKey,
      address_slug: addressSlug,
      geocode_source: latitude !== null && longitude !== null ? "manual" : null,
    })
    .select("id")
    .single();

  if (propertyError) {
    throw new Error(propertyError.message);
  }

  const { error: physicalError } = await supabase
    .from("property_physical")
    .upsert({
      real_property_id: property.id,
    });

  if (physicalError) {
    throw new Error(physicalError.message);
  }

  revalidatePath("/admin/properties");
  revalidatePath("/admin/properties/new");
  redirect("/admin/properties/new?created=1");
}
