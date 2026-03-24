import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AppNotificationProvider } from "./components/system/AppNotifications";
import { RefreshBusProvider } from "./components/system/RefreshBusProvider";
import { NotesDataProvider } from "./hooks/noteManager/useNotes";
import {
  CanvasSnapshotProvider,
} from "./components/system/CanvasSnapshotProvider";
import { ModelRuntimeProvider } from "./components/system/ModelRuntimeProvider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppNotificationProvider>
      <RefreshBusProvider>
        <NotesDataProvider>
          <CanvasSnapshotProvider>
            <ModelRuntimeProvider>
              <App />
            </ModelRuntimeProvider>
          </CanvasSnapshotProvider>
        </NotesDataProvider>
      </RefreshBusProvider>
    </AppNotificationProvider>
  </StrictMode>
);
