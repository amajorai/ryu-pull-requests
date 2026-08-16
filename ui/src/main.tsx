import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("ryu-plugin-root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>
	);
}
