import { useContext,useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./AuthProvider";

export default function Home(){
    const [goToRoomValue,setGoToRoomValue] = useState('');

    const auth = useContext(AuthContext);
      if (!auth) {
        throw new Error("Home must be used inside AuthProvider");
      }
      const [isAuthorized, setIsAuthorized] = auth;
    const navigate = useNavigate();
    
    const handleNewRoom = async () => {
        let roomID;
        await fetch("http://localhost:3000/newroom",{
            credentials: "include",
            method: "POST",
        })
        .then(res=>res.json())
        .then(resjson => {
            roomID = resjson.id
        })
        navigate('/room/'+roomID)

        
    }

    const goToRoom = async () => {
        navigate('/room/'+goToRoomValue)
    }

    return <div className="">
        <button onClick={handleNewRoom}>New room</button>
        <div>Enter existing room: 
            <form onSubmit={goToRoom}><input
                className='border w-64 border-gray-700 mt-4 pt-1 pb-1 pl-1 rounded-md bg-gray-100'
                value={goToRoomValue}
                onChange={e => setGoToRoomValue(e.target.value)}
                placeholder="Enter Room ID"
              /></form>
        </div>
        </div>
}