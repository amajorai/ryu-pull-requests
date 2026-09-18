import type { SVGProps } from "react";

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
	<svg
		aria-hidden="true"
		fill="none"
		height="18"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth="1.7"
		viewBox="0 0 24 24"
		width="18"
		{...props}
	>
		{children}
	</svg>
);
export const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="11" cy="11" r="7" />
		<path d="m20 20-4-4" />
	</Icon>
);
export const PullIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="6" cy="5" r="2" />
		<circle cx="6" cy="19" r="2" />
		<circle cx="18" cy="19" r="2" />
		<path d="M6 7v10M18 17V9a4 4 0 0 0-4-4h-3m3-3-3 3 3 3" />
	</Icon>
);
export const PullClosedIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="6" cy="5" r="2" />
		<circle cx="6" cy="19" r="2" />
		<path d="M6 7v10M18 17V9a4 4 0 0 0-4-4h-3m3-3-3 3 3 3" />
		<path d="m16 16 5 5m0-5-5 5" />
	</Icon>
);
export const PullMergedIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="6" cy="5" r="2" />
		<circle cx="6" cy="19" r="2" />
		<circle cx="18" cy="19" r="2" />
		<path d="M6 7v10M6 7c0 3 2 5 5 5h3a4 4 0 0 1 4 4v1m0-4-3 3 3 3" />
	</Icon>
);
export const PullDraftIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="6" cy="5" r="2" />
		<circle cx="6" cy="19" r="2" />
		<circle cx="18" cy="19" r="2" />
		<path
			d="M6 7v10M18 17V9a4 4 0 0 0-4-4h-3m3-3-3 3 3 3"
			strokeDasharray="2 2"
		/>
	</Icon>
);
export const IssueIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="8" />
		<path d="M8 12h8" />
	</Icon>
);
export const IssueClosedIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="8" />
		<path d="m8.5 12 2.2 2.2 4.8-4.8" />
	</Icon>
);
export const RefreshIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
	</Icon>
);
export const ExternalIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<path d="M14 4h6v6M20 4l-9 9" />
		<path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
	</Icon>
);
export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<path d="m5 12 4 4L19 6" />
	</Icon>
);
export const XIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<path d="m6 6 12 12M18 6 6 18" />
	</Icon>
);
export const MessageIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<path d="M20 15a3 3 0 0 1-3 3H8l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
	</Icon>
);
export const FileIcon = (props: SVGProps<SVGSVGElement>) => (
	<Icon {...props}>
		<path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z" />
		<path d="M14 2v6h6" />
	</Icon>
);
