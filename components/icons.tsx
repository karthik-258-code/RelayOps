import type { SVGProps } from "react";

type IconName = "layers" | "search" | "file" | "arrow" | "check" | "lock" | "clock" | "refresh" | "upload" | "chevron";

const paths: Record<IconName, string> = {
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  search: "m21 21-4.35-4.35M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
  file: "M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7M8 14h8M8 17h8",
  arrow: "M5 12h14m-7-7 7 7-7 7",
  check: "m5 12 4 4L19 6",
  lock: "M6 10V7a6 6 0 1 1 12 0v3m-13 0h14v11H5z",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  refresh: "M20 7v5h-5M4 17v-5h5m11-1a8 8 0 0 0-14-4l-2 2m0 2a8 8 0 0 0 14 4l2-2",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4",
  chevron: "m9 18 6-6-6-6",
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
