import { createContext, useContext, useState } from "react";
import { user } from "../fixtures/user";
import { goals } from "../fixtures/goals";
import { today } from "../fixtures/today";
import { momentum } from "../fixtures/momentum";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [appState, setAppState] = useState({
    user,
    goals,
    today,
    momentum,
  });

  return (
    <AppContext.Provider
      value={{
        appState,
        setAppState,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}