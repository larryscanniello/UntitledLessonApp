import { useEffect,useState,useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./AuthProvider";

export default function Account(){
    const [user, setUser] = useState(null);
    const navigate = useNavigate();
    const auth = useContext(AuthContext);
      if (!auth) {
        throw new Error("Account must be used inside AuthProvider");
      }
      const [isAuthorized, setIsAuthorized] = auth;

    useEffect(() => {
            fetch("http://localhost:3000/me", {
            credentials: "include"  // important: sends cookie
            })
            .then(res => res.json())
            .then(data => {
                if (data.user) {
                setUser(data.user);
                }
            })
            .catch(err => console.error("Error fetching user:", err));
        }, []);

    async function handleLogout(){
        fetch("http://localhost:3000/logout",{
            credentials: "include",
            method: "POST",
        })
        navigate("/");
        setIsAuthorized(null);
    }

    

    return <div><div>{user && user.username}</div>
    <button className="hover:underline" onClick={handleLogout}>Logout</button></div>
}