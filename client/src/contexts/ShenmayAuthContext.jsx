import { createContext, useContext, useState, useEffect } from "react";
import { getMe, isLoggedIn, clearToken } from "@/lib/shenmayApi";

const ShenmayAuthContext = createContext(null);

export const useShenmayAuth = () => useContext(ShenmayAuthContext);

export const ShenmayAuthProvider = ({ children }) => {
  const [shenmayUser, setShenmayUser] = useState(null);
  const [shenmayTenant, setShenmayTenant] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      return;
    }
    getMe()
      .then((data) => {
        setShenmayUser(data.admin || null);
        setShenmayTenant(data.tenant || null);
        setSubscription(data.subscription || null);
      })
      .catch(() => {
        clearToken();
        window.location.href = "/shenmay/login";
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ShenmayAuthContext.Provider value={{
      shenmayUser, setShenmayUser,
      shenmayTenant, setShenmayTenant,
      subscription, setSubscription,
      loading,
    }}>
      {children}
    </ShenmayAuthContext.Provider>
  );
};
