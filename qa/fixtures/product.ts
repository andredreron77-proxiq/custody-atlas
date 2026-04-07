export const qaProduct = {
  routes: {
    workspace: '/workspace',
    caseDashboard: (caseId: string) => `/case/${caseId}`,
  },
  testIds: {
    pageWorkspace: 'page-workspace',
    pageCaseDashboard: 'page-case-dashboard',
    preferredNamePrompt: 'prompt-preferred-name',
    preferredNameInput: 'input-display-name',
    preferredNameSaveButton: 'button-continue-display-name',
    headerDisplayName: 'text-header-display-name',
    sectionWhatMattersNow: 'section-what-matters-now',
    sectionTopRisks: 'section-top-risks',
    sectionRecommendedActions: 'section-recommended-actions',
    sectionKeyDates: 'section-key-dates',
  },
} as const;
