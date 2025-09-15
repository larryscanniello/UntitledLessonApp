import { useEffect, useState, useContext } from "react";
import {AuthContext} from "./AuthProvider";

export default function NavBar(){ 
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("NavBar must be used inside AuthProvider");
  }
  const [isAuthorized, setIsAuthorized] = auth;

  return (
    <nav className="flex justify-between items-center pl-24 pt-3 pb-3 pr-24 border-gray-500 border-b">
      <div>
        <a className="font-bold pr-8" href="/home">Lesson Website</a>
      </div>
      <div className="flex justify-between items-center space-x-8">
        {isAuthorized ? (
          <span><a href="account/">{isAuthorized.user.username}</a></span>
        ) : (
          <a href="http://localhost:3000/auth/google" className="underline">
            Login
          </a>
        )}
      </div>
    </nav>
  );
}