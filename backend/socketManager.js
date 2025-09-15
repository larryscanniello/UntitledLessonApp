
const { Server } = require("socket.io");
const sharedSession = require("express-socket.io-session");


const socketManager = (server,sessionMiddleware) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173", // Your client URL
      methods: ["GET", "POST"],
      credentials: true,
    }
  });

  

  io.use(sharedSession(sessionMiddleware,{
    autoSave: true,
  }));

  io.on('connection', (socket) => {
    let userID;
    if (socket.handshake.session.passport?.user) {
      userID = socket.handshake.session.passport.user;
      console.log("User ID:", userID);
    } else {
      console.log("Unauthenticated socket");
    }
    // Listen for a 'join_room' event
    socket.on('join_room', (roomID) => {
      socket.join(roomID);
      console.log(`User ${socket.handshake.session.passport.user} joined room: ${roomID}`);
    });

    socket.on("send_audio_chunk", (data) => {
      // forward chunk to everyone else in the room
      socket.to(data.roomID).emit("receive_audio_chunk",{chunk:data.chunk,first:data.first})
      
    });

    // Handle a 'send_message' event within a room
    socket.on('send_message', (data) => {
      // Broadcast the message to all users in the specific room
      io.to(data.roomID).emit('receive_message', data.message);
    });

    socket.on('start_recording',()=>{
      io.to(data.roomID).emit('clear_old_audio');
    })

    socket.on('disconnect', () => {
      userID ? console.log(`User disconnected: ${userID}`) : console.log(`Unauthorized user disconnected`);
    });
  });

  return io;
};

module.exports = socketManager;