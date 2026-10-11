import { useEffect, useState } from "react";

/** Poucas rotas não valem um roteador: `/`, `/room/:code`, `/mock` (com `?arena=` e `?theme=` para olhar outra planta e outro tema). */
export type Route =
  | { name: "home" }
  | { name: "room"; code: string }
  | { name: "mock"; arena: string; theme: string };

function parse(pathname: string, search = ""): Route {
  if (/^\/mock\/?$/.test(pathname)) {
    const params = new URLSearchParams(search);
    return { name: "mock", arena: params.get("arena") ?? "", theme: params.get("theme") ?? "" };
  }
  const match = /^\/room\/([A-Za-z0-9]+)\/?$/.exec(pathname);
  return match ? { name: "room", code: match[1].toUpperCase() } : { name: "home" };
}

export function navigate(path: string) {
  history.pushState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname, location.search));

  useEffect(() => {
    const update = () => setRoute(parse(location.pathname, location.search));
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);

  return route;
}

export const roomUrl = (code: string) => `${location.origin}/room/${code}`;
