import { AlertTriangle, CheckCircle2 } from "lucide-react";

// ================================
// LEARN VALIDATION REPORT
// ================================
//
// The server's readiness report, rendered the way it was written: errors block
// publishing, warnings only advise. Both the path editor and the lesson builder
// show the same thing, and both read the 422 body the API sends back, so what
// the author sees here and what the server refuses always agree.

export default function ValidationReport({ validation }) {
  if (!validation) return null;
  const errors = validation.errors || [];
  const warnings = validation.warnings || [];

  if (!errors.length && !warnings.length) {
    return (
      <p className="learn-ready">
        <CheckCircle2 size={15} /> Ready to publish.
      </p>
    );
  }

  return (
    <div className="learn-validation">
      {validation.ready === false && (
        <p className="learn-validation-title blocked">
          <AlertTriangle size={15} /> {errors.length} thing{errors.length === 1 ? "" : "s"} to fix before publishing
        </p>
      )}
      {errors.map((error, index) => (
        <p className="learn-issue error" key={`error-${error.code || index}`}>
          <AlertTriangle size={14} /> {error.message}
        </p>
      ))}
      {warnings.map((warning, index) => (
        <p className="learn-issue warning" key={`warning-${warning.code || index}`}>
          <AlertTriangle size={14} /> {warning.message}
        </p>
      ))}
    </div>
  );
}
