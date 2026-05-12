const joinLines = (values = []) =>
  values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");

export const buildReceiveBillFromText = (project = null) =>
  joinLines([
    project?.companyName || project?.name,
    project?.client ? `Client: ${project.client}` : "",
    project?.address,
    project?.gstNumber ? `GST: ${project.gstNumber}` : "",
    project?.phone ? `Phone: ${project.phone}` : "",
  ]);

export const buildReceiveBillToText = buildReceiveBillFromText;

export const buildReceiveVendorAddressText = (vendor = null) =>
  joinLines([
    vendor?.companyName || vendor?.name,
    vendor?.address,
    [vendor?.city, vendor?.state, vendor?.pincode].filter(Boolean).join(", "),
    vendor?.gstNumber ? `GST: ${vendor.gstNumber}` : "",
    vendor?.phone ? `Phone: ${vendor.phone}` : "",
    vendor?.email ? `Email: ${vendor.email}` : "",
  ]);

export const buildReceiveShipToText = (location = null) =>
  joinLines([
    location?.name,
    location?.address,
    location?.manager ? `Attn: ${location.manager}` : "",
    location?.phone ? `Phone: ${location.phone}` : "",
  ]);

export const splitDocumentText = (value, fallback = "-") => {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : [fallback];
};

export const buildReceiveProjectDetailLines = (project = null) =>
  [
    project?.name,
    project?.companyName && project?.companyName !== project?.name
      ? project.companyName
      : "",
    project?.client ? `Client: ${project.client}` : "",
    project?.address,
    project?.gstNumber ? `GST: ${project.gstNumber}` : "",
    project?.contactPerson ? `Contact: ${project.contactPerson}` : "",
    project?.phone ? `Phone: ${project.phone}` : "",
  ].filter(Boolean);

export const isReceiveProjectDetailsVisible = (record = null) => {
  const value = record?.showProjectDetails;
  if (value === undefined || value === null || value === "") {
    return true;
  }
  return !["0", "false", "no"].includes(String(value).toLowerCase());
};
