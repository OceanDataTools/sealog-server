

const {
  cruisesTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_cruises',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const test_data = [
      {
        _id: ObjectID('5981f167212b348aed7fa9f5'),
        cruise_id: 'AT37-14',
        cruise_location: 'Jaco Scar, Costa Rica',
        cruise_vessel: "R/V Atlantis",
        start_ts: new Date("2017/06/14 00:00:00Z"),
        stop_ts: new Date("2017/06/28 00:00:00Z"),
        cruise_pi: "Bruce Strickrott",
        cruise_additional_meta: {
          cruise_departure_location: 'Norfolk, VA',
          cruise_arrival_location: 'St. George\'s, Bermuda',
          cruise_name: 'Some Cruise Name',
          cruise_description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
          cruise_participants: ["Malcom Reynolds", "River Tam", "Inara Serra", "Kaylee Frye", "Hoban Washburn", "Jayne Cobb", "Zoe Washburn", "Simon Tam", "Shepard Book"]
        },
        cruise_tags: ["engineering"],
        cruise_access_list: ['5981f167212b348aed7fd9f5'],
        cruise_hidden: false
      },
      {
        _id: ObjectID('5981f167212b348aed7fa9f6'),
        cruise_id: 'AT37-13',
        cruise_location: 'Mound 12, Costa Rica',
        cruise_vessel: "R/V Atlantis",
        start_ts: new Date("2017/05/21 00:00:00Z"),
        stop_ts: new Date("2017/06/10 00:00:00Z"),
        cruise_pi: "Eric Cordes",
        cruise_additional_meta: {
          cruise_departure_location: 'Norfolk, VA',
          cruise_arrival_location: 'St. George\'s, Bermuda',
          cruise_name: 'Some Other Cruise Name',
          cruise_description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
          cruise_participants: ["Malcom Reynolds", "River Tam", "Inara Serra", "Kaylee Frye", "Hoban Washburn", "Jayne Cobb", "Zoe Washburn", "Simon Tam", "Shepard Book"]
        },
        cruise_tags: ["corals"],
        cruise_hidden: false
      },
      {
        _id: ObjectID('5981f167212b348aed7fa9f7'),
        cruise_id: 'AT29-02',
        cruise_location: 'Gulf of Mexico',
        cruise_vessel: "R/V Atlantis",
        start_ts: new Date("2015/06/17 00:00:00Z"),
        stop_ts: new Date("2015/06/27 00:00:00Z"),
        cruise_additional_meta: {
          cruise_departure_location: 'Norfolk, VA',
          cruise_arrival_location: 'St. George\'s, Bermuda',
          cruise_name: 'An actual cruise',
          cruise_description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
          cruise_participants: []
        },
        cruise_pi: "Dave Valentine",
        cruise_tags: [],
        cruise_hidden: true
      }
    ];

    console.log("Searching for Cruises Collection");
    try {
      const result = await db.listCollections({ name:cruisesTable }).toArray();
      if (result.length > 0) {
        console.log("Cruises Collection is present... dropping it");
        try {
          await db.dropCollection(cruisesTable);
        }
        catch (err) {
          console.log("DROP ERROR:", err.code);
          throw (err);
        }
      }
    }
    catch (err) {
      console.log("LIST ERROR:", err.code);
      throw (err);
    }

    try {
      console.log("Creating Cruises Collection");
      const collection = await db.createCollection(cruisesTable);

      console.log("Populating Cruises Collection");
      await collection.insertMany(test_data);

    }
    catch (err) {
      console.log("CREATE ERROR:", err.code);
      throw (err);
    }
  }
};