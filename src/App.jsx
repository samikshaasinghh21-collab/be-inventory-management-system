import AppRoutes from "./routes/AppRoutes";
import useThemeMode from "./hooks/useThemeMode";

function App() {
  useThemeMode();
  return <AppRoutes />;
}
export default App;
