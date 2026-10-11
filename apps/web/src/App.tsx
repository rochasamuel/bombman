import { useRoute } from "./lib/router";
import { HomeScreen } from "./screens/HomeScreen";
import { MockScreen } from "./screens/MockScreen";
import { RoomScreen } from "./screens/RoomScreen";

export function App() {
  const route = useRoute();
  if (route.name === "mock") return <MockScreen arena={route.arena} theme={route.theme} />;
  if (route.name === "room") return <RoomScreen key={route.code} code={route.code} />;
  return <HomeScreen />;
}
