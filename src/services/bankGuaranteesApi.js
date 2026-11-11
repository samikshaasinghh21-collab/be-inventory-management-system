import api from './api';
const base = '/finance/bank-guarantees';
export const loadBankGuarantees = async () => (await api.get(base)).data.guarantees;
export const loadBgProjects = async () => (await api.get(`${base}/projects`)).data.projects;
export const loadBankGuarantee = async id => (await api.get(`${base}/${id}`)).data;
export const saveBankGuarantee = async (record, files, action) => {
  const form = new FormData();
  form.append('payload', JSON.stringify(record));
  files.forEach(file => form.append('documents', file));
  const url = record.id ? `${base}/${record.id}${action === 'amend' || action === 'close' ? `/${action}` : ''}` : base;
  return (await api.request({url, method:record.id && action === 'edit' ? 'put' : 'post', data:form})).data;
};
export const downloadBgDocument = async (id, doc) => {
  const response = await api.get(`${base}/${id}/documents/${doc.id}`, {responseType:'blob'});
  const url = URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download=doc.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
