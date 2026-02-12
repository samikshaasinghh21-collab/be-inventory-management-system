import { useNavigate } from "react-router-dom";

const WorkflowPlaceholder = ({ title, description }) => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-slate-500 mt-1">
              {description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/projects")}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900 bg-white"
          >
            Back to Projects
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900 bg-white"
          >
            Go Back
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Placeholder Screen
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              This workflow step is wired. Add the full UI and logic here.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Coming Soon
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-800">
              Data Inputs
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Define the fields and validations required for this step.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-800">
              Actions
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Add save, submit, or approval actions as needed.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-800">
              Outputs
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Generate documents, logs, or status updates here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowPlaceholder;
