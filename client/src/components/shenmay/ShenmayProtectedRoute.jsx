import { Navigate } from "react-router-dom";
import { isLoggedIn } from "@/lib/shenmayApi";

const ShenmayProtectedRoute = ({ children }) => {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default ShenmayProtectedRoute;
