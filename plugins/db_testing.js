'use strict';

exports.register = function (server, options, next) {

  const eventloggerDB = 'eventlogger_devel';
  const usersTable = 'users';
  const eventsTable = 'events';
  const auxDataTable = 'event_aux_data';
  const eventDefinitionTable = 'event_definitions';
  const eventTemplateTable = 'event_templates';
  const eventExportTemplateTable = 'event_export_templates';

//  const db = server.app.db;
  const r = server.app.r;

  console.log("Dropping DB");
  r.dbDrop(eventloggerDB).run().then(() => {

    console.log("Creating DB");
    return r.dbCreate(eventloggerDB).run().then(() => {

      console.log("Creating Table: users");
      return r.db(eventloggerDB).tableCreate(usersTable).run().then(() => {

        //Insert users into db on startup
        const users_data = [{
          id: '0a44ce1a-2cb9-11e6-b67b-9e71128cae77',
          username: 'testadmin',
          fullname: 'Test Admin',
          email: 'notmyemail@gmail.com',
          password: '$2a$10$O1ISz3tliTL59qKvQu.0FuduuoK6PAaAz3XBvGkRxB6pRxrdbtgpG', // node -e "console.log(require('bcryptjs').hashSync('password', require('bcryptjs').genSaltSync()))"
          last_login: new Date().toISOString(),
          roles: ['admin', 'event_manager', 'event_logger', 'event_watcher'],
          favorites: []
        }, {
          id: '0c45d7b4-5881-4e64-8fd3-2057325e2afe',
          username: 'testuser',
          fullname: 'Test User',
          email: 'alsonotmyemail@gmail.com',
          password: '$2a$10$O1ISz3tliTL59qKvQu.0FuduuoK6PAaAz3XBvGkRxB6pRxrdbtgpG', // node -e "console.log(require('bcryptjs').hashSync('password', require('bcryptjs').genSaltSync()))"
          last_login: new Date().toISOString(),
          roles: ['event_manager', 'event_logger', 'event_watcher'],
          favorites: []
        }];

        console.log("Populating Table: users");
        return r.db(eventloggerDB).table(usersTable).insert(users_data).run().then(() => {

          //Create entries table
          console.log("Creating Table: events");
          return r.db(eventloggerDB).tableCreate(eventsTable).run().then(() => {

            //Insert users into db on startup
            const events_data = [{
              id: '2c24f096-0977-11e7-93ae-92361f002671',
              user_name: 'testadmin',
              ts: r.now(),
              event_value: "FISH",
              event_options: [{
                event_option_name: "status",
                event_option_value: "alive"
              }],
              event_free_text: "some free text",
            }, {
              id: '3cd1c5fe-0977-11e7-93ae-92361f002671',
              user_name: 'testuser',
              ts: r.now(),
              event_value: "CORAL",
              event_options: [{
                event_option_name: "status",
                event_option_value: "alive"
              }],
              event_free_text: "some free text",
            }, {
              id: '53d5d4a2-0977-11e7-93ae-92361f002671',
              user_name: 'testuser',
              ts: r.now(),
              event_value: "FISH",
              event_options: [{
                event_option_name: "status",
                event_option_value: "alive"
              }],
              event_free_text: "some free text",
            }, {
              id: '5b8dd1f4-0977-11e7-93ae-92361f002671',
              user_name: 'testadmin',
              ts: r.now(),
              event_value: "FISH",
              event_options: [{
                event_option_name: "status",
                event_option_value: "alive"
              }],
              event_free_text: "some free text",
            }, {
              id: '69bf7188-0977-11e7-93ae-92361f002671',
              user_name: 'testadmin',
              ts: r.now(),
              event_value: "FISH",
              event_options: [{
                event_option_name: "status",
                event_option_value: "alive"
              }],
              event_free_text: "some free text",
            }];

            console.log("Populating Table: events");
            return r.db(eventloggerDB).table(eventsTable).insert(events_data).run().then(() => {

              //Create entries table
              console.log("Creating Table: event_aux_data");
              return r.db(eventloggerDB).tableCreate(auxDataTable).run().then(() => {

                //Insert users into db on startup
                const event_aux_data_data = [{
                  id: '7b5f3fb7-1dd0-4161-a576-e4f3a885a566',
                  event_id: '2c24f096-0977-11e7-93ae-92361f002671',
                  data_source: "datagrabber",
                  data_array: [{
                    data_name: "Latitude",
                    data_value: "41.342981"
                  },{
                    data_name: "Longitude",
                    data_value: "-170.236345"
                  },{
                    data_name: "Depth",
                    data_value: "943.2"
                  },{
                    data_name: "Heading",
                    data_value: "75.2"
                  }]
                },
                {
                  id: '82bf496f-eff2-4d17-8335-83cedc48730b',
                  event_id: '3cd1c5fe-0977-11e7-93ae-92361f002671',
                  data_source: "framegrabber",
                  data_array: [{
                    data_name: "filename",
                    data_value: "./path/framegrab_001.png"
                  },{
                    data_name: "camera_name",
                    data_value: "Camera 01"
                  }]
                },
                {
                  id: '84af9b2b-8737-4d3b-b512-a4523ac4e876',
                  event_id: '3cd1c5fe-0977-11e7-93ae-92361f002671',
                  data_source: "customgrabber",
                  data_array: [{
                    data_name: "customField01",
                    data_value: "100"
                  }]
                },                // {
                //   event_id: '3cd1c5fe-0977-11e7-93ae-92361f002671',
                //   data_source: "datagrabber",
                //   data_array: [{
                //     data_name: "Latitude",
                //     data_value: "41.342981"
                //   },{
                //     data_name: "Longitude",
                //     data_value: "-170.236345"
                //   },{
                //     data_name: "Depth",
                //     data_value: "943.2"
                //   },{
                //     data_name: "Heading",
                //     data_value: "75.2"
                //   }]
                // },
                {
                  id: '774317f4-0594-4a81-9d41-5930c2d93160',
                  event_id: '53d5d4a2-0977-11e7-93ae-92361f002671',
                  data_source: "framegrabber",
                  data_array: [{
                    data_name: "filename",
                    data_value: "./path/framegrab_002.png"
                  },{
                    data_name: "camera_name",
                    data_value: "Camera 02"
                  }]
                },
                {
                  id: '414ba060-3fd9-46fe-90af-eacf17a99d0e',
                  event_id: '53d5d4a2-0977-11e7-93ae-92361f002671',
                  data_source: "datagrabber",
                  data_array: [{
                    data_name: "Latitude",
                    data_value: "41.342981"
                  },{
                    data_name: "Longitude",
                    data_value: "-170.236345"
                  },{
                    data_name: "Depth",
                    data_value: "943.2"
                  },{
                    data_name: "Heading",
                    data_value: "75.2"
                  }]
                },
                {
                  id: '84af9b2b-8737-4d3b-b512-a457dc4e8976',
                  event_id: '5b8dd1f4-0977-11e7-93ae-92361f002671',
                  data_source: "framegrabber",
                  data_array: [{
                    data_name: "filename",
                    data_value: "./path/framegrab_003.png"
                  },{
                    data_name: "camera_name",
                    data_value: "Camera 03"
                  }]
                },
                {
                  id: 'bccebc7a-7e70-4d1b-9eb4-a4acb9bf5e84',
                  event_id: '5b8dd1f4-0977-11e7-93ae-92361f002671',
                  data_source: "datagrabber",
                  data_array: [{
                    data_name: "Latitude",
                    data_value: "41.342981"
                  },{
                    data_name: "Longitude",
                    data_value: "-170.236345"
                  },{
                    data_name: "Depth",
                    data_value: "943.2"
                  },{
                    data_name: "Heading",
                    data_value: "75.2"
                  }]
                },
                {
                  id: 'f843f63b-2b7c-4118-ba07-c73d84605a89',
                  event_id: '69bf7188-0977-11e7-93ae-92361f002671',
                  data_source: "framegrabber",
                  data_array: [{
                    data_name: "filename",
                    data_value: "./path/framegrab_004.png"
                  },{
                    data_name: "camera_name",
                    data_value: "Camera 04"
                  }]
                },
                {
                  id: '5bbfd392-2de1-43c6-a30e-175a9b343a48',
                  event_id: '69bf7188-0977-11e7-93ae-92361f002671',
                  data_source: "datagrabber",
                  data_array: [{
                    data_name: "Latitude",
                    data_value: "41.342981"
                  },{
                    data_name: "Longitude",
                    data_value: "-170.236345"
                  },{
                    data_name: "Depth",
                    data_value: "943.2"
                  },{
                    data_name: "Heading",
                    data_value: "75.2"
                  }]
                }];

                console.log("Populating Table: events_data");
                return r.db(eventloggerDB).table(auxDataTable).insert(event_aux_data_data).run().then(() => {

                  console.log("Creating Table: event_definitions");
                  return r.db(eventloggerDB).tableCreate(eventDefinitionTable).run().then(() => {

// {
//   id: uuid, // id of the event definition
//   event_name: string, // name of the event definition
//   event_value: string, // value of the event text
//   event_free_text_required: bool, // whether to require user to add free text
//   event_options: {
//     event_option_name: string, // name of the event option
//     event_option_type: string, // the type of the event option (dropdown, scale, etc)
//     event_option_default_value: string, // default value for the option
//     event_option_values: [ string ], // list of acceptable values
//     event_option_freeform_value: bool, // whether to allow the option to be manually entered (vs require text to be selected from a strict list)
//     event_option_required: bool // whether completing this option is requried for submission.
//   }
// }
                    //Insert users into db on startup
                    const events_definition_data = [{
                      id: '7b5f3fb7-1dd0-4161-a576-e4f3a885a566',
                      event_name: 'Fish_btn',
                      event_value: 'FISH',
                      event_free_text_required: false,
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
                      id: '7b5f3fb7-1dd0-4161-a576-e4f3a485a566',
                      event_name: 'Rock_btn',
                      event_value: 'ROCK',
                      event_free_text_required: false,
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
                      id: '7b5f3fb7-1dd0-4161-a576-e4f3a235a566',
                      event_name: 'Coral_btn',
                      event_value: 'CORAL',
                      event_free_text_required: false,
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
                      id: '7b5f3fb7-1dd0-4161-a576-e4f3a485a566',
                      event_name: 'Crab_btn',
                      event_value: 'CRAB',
                      event_free_text_required: false,
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
                      id: '7b5f3fb7-1dd0-4161-a576-e4f3a485a346',
                      event_name: 'Squid_btn',
                      event_value: 'SQUID',
                      event_free_text_required: false,
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
                      id: '7b5f3fb7-1dd0-4161-a576-e4f3a765a566',
                      event_name: 'Sample_btn',
                      event_value: 'SAMPLE',
                      event_free_text_required: false,
                      event_options: []
                    },
                    {
                      id: '7b5f3fb7-1dd0-4161-a500-e4f3a485a566',
                      event_name: 'Problem_btn',
                      event_value: 'PROBLEM',
                      event_free_text_required: false,
                      event_options: []
                    },
                    {
                      id:"df3372b1-6218-469f-aa7c-ecd083a8a931",
                      event_name: "super_event_btn",
                      event_value: "SUPER_EVENT",
                      event_free_text_required: false,
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
                    }];

                    console.log("Populating Table: event_definitions");
                    return r.db(eventloggerDB).table(eventDefinitionTable).insert(events_definition_data).run().then(() => {

                      console.log("Creating Table: event_templates");
                      return r.db(eventloggerDB).tableCreate(eventTemplateTable).run().then(() => {

                        //Insert template data into db on startup
                        const events_template_data = [{
                          id: "3bf07743-c880-4cb3-a26f-93fda90aaf64",
                          event_template_name: "Awesome Events",
                          event_definitions: ['7b5f3fb7-1dd0-4161-a576-e4f3a885a566']
                        },{
                          id: "3bf07743-c880-4cb3-a26f-93fda90aaf54",
                          event_template_name: "Awesomest Events",
                          event_definitions: ['7b5f3fb7-1dd0-4161-a576-e4f3a885a566']
                        }];

                        console.log("Populating Table: event_templates");
                        return r.db(eventloggerDB).table(eventTemplateTable).insert(events_template_data).run().then(() => {

                          console.log("Creating Table: event_export_templates");
                          return r.db(eventloggerDB).tableCreate(eventExportTemplateTable).run().then(() => {

                            //Insert template data into db on startup
                            const event_exports_template_data = [{
                              id: "3bf07743-c430-4cb3-a26f-93fda90aaf64",
                              event_export_template_name: "All Events",
                              event_export_template_eventvalue_filter: ["FISH"],
                              event_export_template_offset: 0,
                              event_export_template_limit: 0,
                              event_export_template_startTS: '',
                              event_export_template_stopTS: r.ISO8601('2017-12-31T23:59:59.999Z'),
                              event_export_template_user_filter: [],
                              event_export_template_datasource_filter: [],
                              event_export_template_freetext_filter: '',
                              event_export_template_include_aux_data: true
                            }];

                            console.log("Populating Table: event_export_templates");
                            return r.db(eventloggerDB).table(eventExportTemplateTable).insert(event_exports_template_data).run().then(() => {
                              return next();
                            }).catch((err) => {
                              throw err;
                            });
                          }).catch((err) => {
                            throw err;
                          });
                        }).catch((err) => {
                          throw err;
                        });
                      }).catch((err) => {
                        throw err;
                      });
                    }).catch((err) => {
                      throw err;
                    });
                  }).catch((err) => {
                    throw err;
                  });
                }).catch((err) => {
                  throw err;
                });
              }).catch((err) => {
                throw err;
              });
            }).catch((err) => {
              throw err;
            });
          }).catch((err) => {
            throw err;
          });
        }).catch((err) => {
          throw err;
        });
      }).catch((err) => {
        throw err;
      });
    }).catch((err) => {
      throw err;
    });
  }).catch((err) => {
    console.log("Creating DB");
    r.dbCreate(eventloggerDB).run().then(() => {
      return next();
    });
    throw err;

  });

  return null;
};

exports.register.attributes = {
  name: 'db-testing',
  dependencies: ['db']
};

