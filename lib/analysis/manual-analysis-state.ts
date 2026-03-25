export type ManualAnalysisFormState = {
  status: "idle" | "success" | "error";
  message: string | null;
  analysisId: string | null;
};

export const initialManualAnalysisFormState: ManualAnalysisFormState = {
  status: "idle",
  message: null,
  analysisId: null,
};
