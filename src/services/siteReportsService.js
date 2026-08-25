import {
  approveDailySiteReport,
  createDailySiteReport,
  deleteDailySiteReport,
  fetchDailySiteReports,
  rejectDailySiteReport,
  submitDailySiteReport,
  updateDailySiteReport,
} from "./projectManagementApi";
const sameId = (left, right) => String(left) === String(right);
let cache = [];
const replace = (report) => {
  cache = [report, ...cache.filter((item) => !sameId(item.id, report.id))];
  return report;
};

export const siteReportsService = {
  list: () => cache,
  refresh: async () => {
    cache = await fetchDailySiteReports();
    return cache;
  },
  create: async (input) => {
    const report = await createDailySiteReport(input);
    return replace(report);
  },
  update: async (id, input) => replace(await updateDailySiteReport(id, input)),
  submit: async (id) => replace(await submitDailySiteReport(id)),
  approve: async (id, input) => replace(await approveDailySiteReport(id, input)),
  reject: async (id, input) => replace(await rejectDailySiteReport(id, input)),
  delete: async (id) => {
    await deleteDailySiteReport(id);
    cache = cache.filter((item) => !sameId(item.id, id));
  },
};
