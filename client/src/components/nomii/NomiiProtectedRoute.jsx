import { Navigate } from "react-router-dom";
import { isLoggedIn } from "@/lib/nomiiApi";

const NomiiProtectedRoute = ({ children }) => {
  if (!isLoggedIn()) {
    return <Navigate to="/nomii/login" replace />;
  }
  return children;
};

export default NomiiProtectedRoute;
