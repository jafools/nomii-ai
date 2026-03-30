import { createContext, useContext, useState, useEffect } from "react";
import { getMe, isLoggedIn, clearToken } from "@/lib/nomiiApi";

const NomiiAuthContext = createContext(null);

export const useNomiiAuth = () => useContext(NomiiAuthContext);

export const NomiiAuthProvider = ({ children }) => {
  const [nomiiUser, setNomiiUser] = useState(null);
  const [nomiiTenant, setNomiiTenant] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      return;
    }
    getMe()
      .then((data) => {
        setNomiiUser(data.admin || null);
        setNomiiTenant(data.tenant || null);
        setSubscription(data.subscription || null);
      })
      .catch(() => {
        clearToken();
        window.location.href = "/nomii/login";
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <NomiiAuthContext.Provider value={{
      nomiiUser, setNomiiUser,
      nomiiTenant, setNomiiTenant,
      subscription, setSubscription,
      loading,
    }}>
      {children}
    </NomiiAuthContext.Provider>
  );
};
