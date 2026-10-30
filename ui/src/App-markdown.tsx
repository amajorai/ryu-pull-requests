import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function safeExternalUrl(
	value: string | null | undefined
): string | null {
	if (!value) {
		return null;
	}
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.href
			: null;
	} catch {
		return null;
	}
}

export function PullRequestMarkdown({
	className,
	content,
}: {
	className?: string;
	content: string;
}) {
	const classes = ["markdown-body", className].filter(Boolean).join(" ");
	return (
		<div className={classes}>
			<ReactMarkdown
				components={{
					a: ({ children, href }) => {
						const safeUrl = safeExternalUrl(href);
						return safeUrl ? (
							<a href={safeUrl} rel="noopener noreferrer" target="_blank">
								{children}
							</a>
						) : (
							<span>{children}</span>
						);
					},
					img: () => null,
					input: () => <span aria-hidden="true" />,
				}}
				remarkPlugins={[remarkGfm]}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
