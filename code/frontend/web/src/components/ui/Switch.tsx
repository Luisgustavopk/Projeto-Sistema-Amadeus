import type { InputHTMLAttributes } from 'react';
export function Switch(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>,
) {
  return <input {...props} type="checkbox" />;
}
