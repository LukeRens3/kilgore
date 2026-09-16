import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const DatabaseIcon = (props: IconProps) => (
  <Icon {...props}>
    <ellipse cx="8" cy="3.75" rx="5.25" ry="2.25" />
    <path d="M2.75 3.75v8.5c0 1.24 2.35 2.25 5.25 2.25s5.25-1.01 5.25-2.25v-8.5" />
    <path d="M2.75 8c0 1.24 2.35 2.25 5.25 2.25S13.25 9.24 13.25 8" />
  </Icon>
);

export const TableIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.25" />
    <path d="M2.25 6.25h11.5M6.5 6.25v7" />
  </Icon>
);

export const ViewIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M1.5 8s2.5-4.25 6.5-4.25S14.5 8 14.5 8s-2.5 4.25-6.5 4.25S1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="1.75" />
  </Icon>
);

export const ColumnIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 4.5h8M4 8h8M4 11.5h5" />
  </Icon>
);

export const KeyIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5.25" cy="10.75" r="2.5" />
    <path d="M7.25 9 13 3.25M11 5.25l1.5 1.5M9.5 6.75 11 8.25" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 2.75 13 8l-8.5 5.25V2.75Z" fill="currentColor" strokeWidth="1.2" />
  </Icon>
);

export const StopIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.75" y="3.75" width="8.5" height="8.5" rx="1.25" fill="currentColor" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="7.25" cy="7.25" r="4.5" />
    <path d="M10.5 10.5 13.5 13.5" />
  </Icon>
);

export const RefreshIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.77" />
    <path d="M13.25 2.5v3h-3" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2.75v7.5M4.75 7.25 8 10.5l3.25-3.25" />
    <path d="M2.75 12.25h10.5" />
  </Icon>
);

export const WandIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 13 10.5 5.5" />
    <path d="M9.25 4.25 11.75 6.75" />
    <path d="M12.5 2v2M14.75 4.25h-2M5 2.5v1.5M5.75 3.25h-1.5" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Icon>
);

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="3.25" />
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06" />
  </Icon>
);

export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.25 9.5A5.75 5.75 0 0 1 6.5 2.75a5.75 5.75 0 1 0 6.75 6.75Z" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2.75 14.5 13.25h-13L8 2.75Z" />
    <path d="M8 6.75v3M8 11.5v.01" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.25 8.5 6.5 11.75l6.25-7" />
  </Icon>
);

export const ServerIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.25" y="2.75" width="11.5" height="4.5" rx="1.25" />
    <rect x="2.25" y="8.75" width="11.5" height="4.5" rx="1.25" />
    <path d="M4.75 5h.01M4.75 11h.01" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.25" />
    <path d="M5.5 7V4.75a2.5 2.5 0 0 1 5 0V7" />
  </Icon>
);

export const SignOutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.25 2.75H3.5a.75.75 0 0 0-.75.75v9a.75.75 0 0 0 .75.75h2.75" />
    <path d="M10 5.25 12.75 8 10 10.75" />
    <path d="M12.75 8h-6.5" />
  </Icon>
);
