import { forwardRef, type ButtonHTMLAttributes } from 'react';
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function Button(props, ref) {
  return <button {...props} ref={ref} />;
});
