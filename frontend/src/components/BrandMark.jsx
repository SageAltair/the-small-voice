import logoDark from "../assets/small-voice-dark-mode.svg";
import logoLight from "../assets/small-voice-symbol.svg";

// Brand mark that automatically swaps between the light-mode symbol (navy
// rings with an orange centre on transparent) and the dark-mode badge (navy
// rounded square with cream rings), driven by the active data-theme on <html>.
export default function BrandMark({ className = "" }) {
  return (
    <>
      <img
        src={logoLight}
        alt=""
        aria-hidden="true"
        className={`brand-mark brand-mark--light ${className}`.trim()}
      />
      <img
        src={logoDark}
        alt=""
        aria-hidden="true"
        className={`brand-mark brand-mark--dark ${className}`.trim()}
      />
    </>
  );
}
