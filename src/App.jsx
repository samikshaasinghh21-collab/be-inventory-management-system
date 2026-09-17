import Toaster from "./components/ui/Toaster";
import AppRoutes from "./routes/AppRoutes";
import useThemeMode from "./hooks/useThemeMode";

function App() {
  useThemeMode();
  return <><AppRoutes /><Toaster /></>;
}
export default App;
