export type ImportProfile = {
  id: string;
  label: string;
  sourceSystem: string;
  defaultState: string;
  requiredHeaders: string[];
  requiredRowFields: string[];
};

export const recoloradoBasic50Profile: ImportProfile = {
  id: "recolorado_basic_50",
  label: "REcolorado Basic 50",
  sourceSystem: "recolorado",
  defaultState: "CO",
  requiredHeaders: [
    "County Or Parish",
    "City",
    "Postal Code",
    "Mls Status",
    "Mls Major Change Type",
    "Property Condition",
    "Property Sub Type",
    "Structure Type",
    "Attached Property",
    "Listing ID",
    "Address",
    "Subdivision Name",
    "Levels",
    "Year Built",
    "Building Area Total",
    "Above Grade Finished Area",
    "Below Grade (SqFt) Total",
    "Below Grade Finished Area",
    "Lot Size Square Feet",
    "Lot Size Acres",
    "Bedrooms Total",
    "Main Level Bedrooms",
    "Upper Level Bedrooms",
    "Bathrooms Total Integer",
    "Main Level Bathrooms",
    "Upper Level Bathrooms",
    "Garage Spaces",
    "Original List Price",
    "List Price",
    "Close Price",
    "Concessions Amount",
    "Listing Contract Date",
    "Purchase Contract Date",
    "Close Date",
    "Tax Annual Amount",
    "Association Fee Total Annual",
    "Ownership",
    "Occupant Type",
    "Elementary School",
    "List Agent Mls Id",
    "Buyer Agent Mls Id",
    "Parcel Number",
    "Latitude",
    "Longitude",
    "Street Number",
    "Street Dir Prefix",
    "Street Name",
    "Street Dir Suffix",
    "Street Suffix",
    "Unit Number",
  ],
  requiredRowFields: ["Listing ID", "Address", "City"],
};

export function normalizeFilenameBase(fileName: string) {
  return fileName.replace(/\s*\(\d+\)(?=\.csv$)/i, "").trim();
}
