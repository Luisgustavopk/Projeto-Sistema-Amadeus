export function Subtitle({
  visible,
  text,
}: {
  visible: boolean;
  text: string;
}) {
  return (
    <p id="subtitle" hidden={!visible} className="subtitle" aria-live="polite">
      {text}
    </p>
  );
}
