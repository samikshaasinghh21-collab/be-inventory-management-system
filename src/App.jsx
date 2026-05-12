import AppRoutes from "./routes/AppRoutes";
import useThemeMode from "./hooks/useThemeMode";
import useUppercaseInputs from "./hooks/useUppercaseInputs";

function App() {
  useThemeMode();
  useUppercaseInputs();
  return <AppRoutes />;
}
export default App;
