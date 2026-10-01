import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchCustomers } from "../../services/customersApi";

export default function PartyDetails({ kind }) {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const vendor = kind === "vendors";
  useEffect(() => {
    let live = true;
    setLoading(true); setError(""); setRecord(null);
    (vendor ? fetchVendors() : fetchCustomers()).then((records) => {
      if (!live) return;
      const found = records.find((row) => String(row.id) === id);
      setRecord(found || null);
      if (!found) setError("Record not found.");
    }).catch((err) => { if (live) setError(err.response?.data?.error || "Unable to load details."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, vendor]);
  const fields = [["Name", "name"], ["Company", "companyName"], ["Phone", "phone"], ["Email", "email"], ["GST Number", "gstNumber"], ["PAN Number", "panNumber"], ["Address", "address"], ["City", "city"], ["State", "state"], ["PIN Code", "pincode"], ...(vendor ? [["Account Name", "bankAccountName"], ["Account Number", "bankAccountNumber"], ["Bank", "bankName"], ["IFSC", "ifscCode"], ["Branch", "bankBranch"]] : [["GST Type", "gstType"]])];
  return <section className="rounded-xl bg-white p-6 space-y-5">
    <Link className="text-blue-700" to={`/inventory/${kind}`}>Back to {kind}</Link>
    <h1 className="text-xl font-bold">{vendor ? "Vendor" : "Customer"} Details</h1>
    {loading && <p>Loading saved details…</p>}{error && <p role="alert">{error}</p>}
    {record && <><dl className="grid gap-4 md:grid-cols-2">{fields.map(([label, key]) => <div key={key}><dt className="text-sm text-slate-500">{label}</dt><dd className="whitespace-pre-wrap">{record[key] || "—"}</dd></div>)}</dl>
      <h2 className="font-bold">Contacts</h2>{record.contacts.length ? record.contacts.map((contact, index) => <div key={contact.id || index} className="border rounded p-3">{[contact.contactName, contact.designation, contact.phone, contact.email].filter(Boolean).join(" · ")}</div>) : <p>No contacts saved.</p>}
      <h2 className="font-bold">Documents</h2>{record.documents.length ? record.documents.map((doc, index) => <p key={doc.id || index}>{doc.name || doc.fileName || `Document ${index + 1}`}</p>) : <p>No documents saved.</p>}
    </>}
  </section>;
}
