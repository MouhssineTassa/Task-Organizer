import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import AuthGate from "./components/AuthGate";
import Dashboard from "./pages/Dashboard";
import Planning from "./pages/Planning";
import EdtImport from "./pages/EdtImport";
import Tasks from "./pages/Tasks";
import Notes from "./pages/Notes";
import Progression from "./pages/Progression";
import Objectifs from "./pages/Objectifs";
import Etudes from "./pages/Etudes";
import Bibliotheque from "./pages/Bibliotheque";
import Media from "./pages/Media";
import Sport from "./pages/Sport";
import Projets from "./pages/Projets";
import Inbox from "./pages/Inbox";
import SearchPage from "./pages/SearchPage";
import Analytics from "./pages/Analytics";
import Parametres from "./pages/Parametres";
import { Assistant } from "./pages/Placeholders";

function App() {
  return (
    <AuthGate>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="planning" element={<Planning />} />
          <Route path="planning/import" element={<EdtImport />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="etudes" element={<Etudes />} />
          <Route path="bibliotheque" element={<Bibliotheque />} />
          <Route path="media" element={<Media />} />
          <Route path="sport" element={<Sport />} />
          <Route path="notes" element={<Notes />} />
          <Route path="projets" element={<Projets />} />
          <Route path="objectifs" element={<Objectifs />} />
          <Route path="progression" element={<Progression />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="parametres" element={<Parametres />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthGate>
  );
}

export default App;
