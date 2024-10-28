// server.js
require('dotenv').config();
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const csv = require('csv-parser');
const fs = require('fs');
const app = express();

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

app.use(express.urlencoded({ extended: true }));

// Helper function to load hotel rooms from CSV
function loadHotelRooms() {
    return new Promise((resolve, reject) => {
        const rooms = [];
        fs.createReadStream('hotel_rooms.csv')
            .pipe(csv())
            .on('data', (row) => rooms.push(row))
            .on('end', () => resolve(rooms))
            .on('error', reject);
    });
}

// Get available rooms
async function getAvailableRooms() {
    const rooms = await loadHotelRooms();
    return rooms.filter(room => room.status === 'available');
}

// Get room types and prices
async function getRoomTypes() {
    const rooms = await loadHotelRooms();
    return rooms.reduce((types, room) => {
        if (!types[room.room_type]) {
            types[room.room_type] = parseFloat(room.price_per_night);
        }
        return types;
    }, {});
}

// Handle incoming calls
app.post('/answer', (req, res) => {
    const twiml = new VoiceResponse();
    
    const gather = twiml.gather({
        input: 'speech',
        action: '/handle-inquiry',
        speechTimeout: 'auto',
        language: 'en-US'
    });
    
    gather.say({
        voice: 'Polly.Amy-Neural',
    }, 'Welcome to our Hotel Reservation System. ' +
       'You can ask about room availability, prices, or make a reservation. ' +
       'What would you like to know?');
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle user inquiries
app.post('/handle-inquiry', async (req, res) => {
    const twiml = new VoiceResponse();
    const userInput = req.body.SpeechResult?.toLowerCase() || '';

    try {
        // Check for availability queries
        if (userInput.includes('available') || userInput.includes('vacancy')) {
            const availableRooms = await getAvailableRooms();
            const gather = twiml.gather({
                input: 'speech',
                action: '/handle-room-type',
                speechTimeout: 'auto'
            });

            gather.say({
                voice: 'Polly.Amy-Neural',
            }, `We have ${availableRooms.length} rooms available. ` +
               'Would you like to hear about specific room types and their prices?');

        // Check for price queries
        } else if (userInput.includes('price') || userInput.includes('cost')) {
            const roomTypes = await getRoomTypes();
            let priceInfo = 'Here are our room types and prices per night: ';
            
            Object.entries(roomTypes).forEach(([type, price]) => {
                priceInfo += `${type} for $${price.toFixed(2)}. `;
            });

            const gather = twiml.gather({
                input: 'speech',
                action: '/handle-booking',
                speechTimeout: 'auto'
            });

            gather.say({
                voice: 'Polly.Amy-Neural',
            }, priceInfo + 'Would you like to make a reservation?');

        // Handle booking requests
        } else if (userInput.includes('book') || userInput.includes('reserve')) {
            const gather = twiml.gather({
                input: 'speech',
                action: '/handle-booking',
                speechTimeout: 'auto'
            });

            gather.say({
                voice: 'Polly.Amy-Neural',
            }, 'I can help you with a reservation. ' +
               'What type of room would you like to book?');

        // Default response for unclear input
        } else {
            const gather = twiml.gather({
                input: 'speech',
                action: '/handle-inquiry',
                speechTimeout: 'auto'
            });

            gather.say({
                voice: 'Polly.Amy-Neural',
            }, "I'm sorry, I didn't quite catch that. " +
               'You can ask about room availability, prices, or make a reservation. ' +
               'What would you like to know?');
        }

    } catch (error) {
        console.error('Error handling inquiry:', error);
        twiml.say({
            voice: 'Polly.Amy-Neural',
        }, 'Sorry, we encountered an error. Please try again later.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle booking process
app.post('/handle-booking', async (req, res) => {
    const twiml = new VoiceResponse();
    const userInput = req.body.SpeechResult?.toLowerCase() || '';

    try {
        const availableRooms = await getAvailableRooms();
        const matchingRooms = availableRooms.filter(room => 
            room.room_type.toLowerCase().includes(userInput)
        );

        if (matchingRooms.length > 0) {
            const room = matchingRooms[0];
            const gather = twiml.gather({
                input: 'speech',
                action: '/confirm-booking',
                speechTimeout: 'auto'
            });

            gather.say({
                voice: 'Polly.Amy-Neural',
            }, `I found a ${room.room_type} room with a ${room.view_type} view ` +
               `for $${room.price_per_night} per night. ` +
               'Would you like to proceed with the booking?');

        } else {
            const gather = twiml.gather({
                input: 'speech',
                action: '/handle-booking',
                speechTimeout: 'auto'
            });

            gather.say({
                voice: 'Polly.Amy-Neural',
            }, "I'm sorry, I couldn't find an available room of that type. " +
               'Would you like to hear about other room types we have available?');
        }

    } catch (error) {
        console.error('Error handling booking:', error);
        twiml.say({
            voice: 'Polly.Amy-Neural',
        }, 'Sorry, we encountered an error. Please try again later.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle booking confirmation
app.post('/confirm-booking', (req, res) => {
    const twiml = new VoiceResponse();
    const userInput = req.body.SpeechResult?.toLowerCase() || '';

    if (userInput.includes('yes') || userInput.includes('confirm')) {
        twiml.say({
            voice: 'Polly.Amy-Neural',
        }, 'Great! To complete your booking, I\'ll transfer you to our reservation desk ' +
           'to collect your information and payment details. Please stay on the line.');
        
        // Add transfer logic here
        // twiml.dial('+1234567890');

    } else {
        const gather = twiml.gather({
            input: 'speech',
            action: '/handle-inquiry',
            speechTimeout: 'auto'
        });

        gather.say({
            voice: 'Polly.Amy-Neural',
        }, 'No problem. Would you like to hear about other room options?');
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    const twiml = new VoiceResponse();
    twiml.say({
        voice: 'Polly.Amy-Neural',
    }, 'Sorry, we encountered an unexpected error. Please try again later.');
    res.type('text/xml');
    res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});