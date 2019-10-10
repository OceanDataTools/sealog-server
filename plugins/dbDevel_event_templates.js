

const {
  eventTemplatesTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_event_templates',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const test_data = [
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b2c"),
        event_name: 'FISH',
        event_value: 'FISH',
        event_free_text_required: false,
        system_template: false,
        event_options: [{
          event_option_name: "Status",
          event_option_type: "dropdown",
          event_option_default_value: "",
          event_option_values: ["alive","dead","undead"],
          event_option_allow_freeform: false,
          event_option_required: false
        }]
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b2d"),
        event_name: 'ROCK',
        event_value: 'ROCK',
        event_free_text_required: false,
        system_template: false,
        event_options: [{
          event_option_name: "Color",
          event_option_type: "dropdown",
          event_option_default_value: "",
          event_option_values: ["black","red","green"],
          event_option_allow_freeform: false,
          event_option_required: false
        }]
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b2e"),
        event_name: 'CORAL',
        event_value: 'CORAL',
        event_free_text_required: false,
        system_template: false,
        event_options: [{
          event_option_name: "Color",
          event_option_type: "dropdown",
          event_option_default_value: "",
          event_option_values: ["black","red","purple"],
          event_option_allow_freeform: false,
          event_option_required: false
        }]
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b2f"),
        event_name: 'CRAB',
        event_value: 'CRAB',
        event_free_text_required: false,
        system_template: false,
        event_options: [{
          event_option_name: "Color",
          event_option_type: "dropdown",
          event_option_default_value: "",
          event_option_values: ["blue","red","green"],
          event_option_allow_freeform: false,
          event_option_required: false
        }]
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b30"),
        event_name: 'SQUID',
        event_value: 'SQUID',
        event_free_text_required: false,
        system_template: false,
        event_options: [{
          event_option_name: "Color",
          event_option_type: "dropdown",
          event_option_default_value: "",
          event_option_values: ["purple","red","pink"],
          event_option_allow_freeform: false,
          event_option_required: false
        }]
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b31"),
        event_name: 'SAMPLE',
        event_value: 'SAMPLE',
        event_free_text_required: false,
        system_template: true,
        event_options: [
          {
            event_option_allow_freeform: false,
            event_option_name: "Sample ID",
            event_option_required: true,
            event_option_type: "text",
            event_option_values: []
          },
          {
            event_option_allow_freeform:false,
            event_option_name: "Sample Type",
            event_option_required: true,
            event_option_type: "dropdown",
            event_option_values: ["push core","physical sample","fluid sample","slurp","majors","gas tight","hog bio", "hog chem"]
          }
        ]
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b32"),
        event_name: 'PROBLEM',
        event_value: 'PROBLEM',
        event_free_text_required: false,
        system_template: true,
        event_options: []
      },
      {
        "_id" : ObjectID("5a71c3d7fa96aa1977822b33"),
        event_name: "SUPER_EVENT",
        event_value: "SUPER_EVENT",
        event_free_text_required: false,
        system_template: false,
        event_options:[
          {
            event_option_allow_freeform: false,
            event_option_name: "first text option",
            event_option_required: false,
            event_option_type: "text",
            event_option_values: []
          },
          {
            event_option_allow_freeform: false,
            event_option_name: "second text option",
            event_option_required: true,
            event_option_type: "text",
            event_option_values: []
          },
          {
            event_option_allow_freeform:false,
            event_option_name: "first checkbox option",
            event_option_required: false,
            event_option_type: "checkboxes",
            event_option_values: ["1","2","3","4"]
          },
          {
            event_option_allow_freeform:false,
            event_option_name: "first select option",
            event_option_required: false,
            event_option_type: "dropdown",
            event_option_values: ["1","2","3","4"]
          },
          {
            event_option_allow_freeform: false,
            event_option_default_value: "1",
            event_option_name: "second select option",
            event_option_required: false,
            event_option_type: "dropdown",
            event_option_values: ["1","2","3","4"]
          },
          {
            event_option_allow_freeform: false,
            event_option_name: "third select option",
            event_option_required: true,
            event_option_type: "dropdown",
            event_option_values: ["1","2","3","4"]
          },
          {
            event_option_allow_freeform: false,
            event_option_default_value: "1",
            event_option_name: "fourth select option",
            event_option_required: true,
            event_option_type: "dropdown",
            event_option_values: ["1","2","3","4"]
          }
        ]
      }
    ];

    console.log("Searching for Event Templates Collection");
    try {
      const result = await db.listCollections({ name:eventTemplatesTable }).toArray();
      if (result.length > 0) {
        console.log("Event Templates Collection is present... dropping it");
        try {
          await db.dropCollection(eventTemplatesTable);
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
      console.log("Creating Event Templates Collection");
      const collection = await db.createCollection(eventTemplatesTable);

      console.log("Populating Event Templates Collection");
      await collection.insertMany(test_data);

    }
    catch (err) {
      console.log("CREATE ERROR:", err.code);
      throw (err);
    }
  }
};