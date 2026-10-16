const database=db.getSiblingDB('remote_mac_relay');database.createUser({user:'remote_app',pwd:process.env.MONGO_APP_PASSWORD,roles:[{role:'readWrite',db:'remote_mac_relay'}]});
