import type { CampaignFormField, VisitAnswer } from "@/types/campaign-form";

export function getAnswerValue(answers: VisitAnswer[], fieldName: string): unknown {
  const found = answers.find((answer) => answer.fieldName === fieldName);
  return found?.value;
}

export function shouldShowField(field: CampaignFormField, answers: VisitAnswer[]): boolean {
  if (!field.dependsOn) return true;
  const sourceValue = getAnswerValue(answers, field.dependsOn.fieldName);
  return String(sourceValue ?? "") === field.dependsOn.value;
}

export function updateAnswer(answers: VisitAnswer[], fieldName: string, value: unknown): VisitAnswer[] {
  const nextAnswers = [...answers];
  const existingIndex = nextAnswers.findIndex((answer) => answer.fieldName === fieldName);
  if (existingIndex === -1) {
    nextAnswers.push({ fieldName, value });
    return nextAnswers;
  }
  nextAnswers[existingIndex] = { ...nextAnswers[existingIndex], value };
  return nextAnswers;
}

