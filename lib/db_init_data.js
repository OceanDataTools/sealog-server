const ObjectID = require('mongodb').ObjectID;
const { randomAsciiString, hashedPassword } = require('./utils');

const cruises_develDB_data = [
  {
    _id: ObjectID('5981f167212b348aed7fa9f5'),
    cruise_id: 'AT37-14',
    cruise_location: 'Jaco Scar, Costa Rica',
    start_ts: new Date('2017/06/14 00:00:00Z'),
    stop_ts: new Date('2017/06/28 00:00:00Z'),
    cruise_additional_meta: {
      cruise_vessel: 'R/V Atlantis',
      cruise_pi: 'Bruce Strickrott',
      cruise_departure_location: 'Norfolk, VA',
      cruise_arrival_location: 'St. George\'s, Bermuda',
      cruise_name: 'Some Cruise Name',
      cruise_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
      cruise_participants: ['Malcom Reynolds', 'River Tam', 'Inara Serra', 'Kaylee Frye', 'Hoban Washburn', 'Jayne Cobb', 'Zoe Washburn', 'Simon Tam', 'Shepard Book']
    },
    cruise_tags: ['engineering'],
    cruise_access_list: ['5981f167212b348aed7fd9f5'],
    cruise_hidden: false
  },
  {
    _id: ObjectID('5981f167212b348aed7fa9f6'),
    cruise_id: 'AT37-13',
    cruise_location: 'Mound 12, Costa Rica',
    start_ts: new Date('2017/05/21 00:00:00Z'),
    stop_ts: new Date('2017/06/10 00:00:00Z'),
    cruise_additional_meta: {
      cruise_vessel: 'R/V Atlantis',
      cruise_pi: 'Eric Cordes',
      cruise_departure_location: 'Norfolk, VA',
      cruise_arrival_location: 'St. George\'s, Bermuda',
      cruise_name: 'Some Other Cruise Name',
      cruise_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
      cruise_participants: ['Malcom Reynolds', 'River Tam', 'Inara Serra', 'Kaylee Frye', 'Hoban Washburn', 'Jayne Cobb', 'Zoe Washburn', 'Simon Tam', 'Shepard Book']
    },
    cruise_tags: ['corals'],
    cruise_hidden: false
  },
  {
    _id: ObjectID('5981f167212b348aed7fa9f7'),
    cruise_id: 'AT29-02',
    cruise_location: 'Gulf of Mexico',
    start_ts: new Date('2015/06/17 00:00:00Z'),
    stop_ts: new Date('2015/06/27 00:00:00Z'),
    cruise_additional_meta: {
      cruise_vessel: 'R/V Atlantis',
      cruise_pi: 'Dave Valentine',
      cruise_departure_location: 'Norfolk, VA',
      cruise_arrival_location: 'St. George\'s, Bermuda',
      cruise_name: 'An actual cruise',
      cruise_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
      cruise_participants: []
    },
    cruise_tags: [],
    cruise_hidden: true
  }
];

const custom_vars_init_data = [
  {
    _id: ObjectID('59810167212b348aed7fa9f5'),
    custom_var_name: 'asnapStatus',
    custom_var_value: 'Off'
  },
  {
    _id: ObjectID('59810167212b348aed7fa9f6'),
    custom_var_name: 'freeSpaceInBytes',
    custom_var_value: '0'
  },
  {
    _id: ObjectID('59810167212b348aed7fa9f7'),
    custom_var_name: 'freeSpacePercentage',
    custom_var_value: '0'
  }
];

const event_aux_data_develDB_data = [
  {
    _id: ObjectID('5a7341898c1553258f703ce0'),
    event_id: ObjectID('5981f167212b348aed7fa9f6'),
    data_source: 'vehicleRealtimeNavData',
    data_array: [{
      data_name: 'latitude',
      data_value: '41.342981',
      data_uom: 'ddeg'

    },{
      data_name: 'longitude',
      data_value: '-170.236345',
      data_uom: 'ddeg'
    },{
      data_name: 'depth',
      data_value: '943.2',
      data_uom: 'meters'
    },{
      data_name: 'heading',
      data_value: '75.2',
      data_uom: 'deg'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce1'),
    event_id: ObjectID('5981f167212b348aed7fa9f6'),
    data_source: 'framegrabber',
    data_array: [{
      data_name: 'camera_name',
      data_value: 'Camera 01'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_001.png'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce2'),
    event_id: ObjectID('5981f167212b348aed7fa9f6'),
    data_source: 'customgrabber',
    data_array: [{
      data_name: 'customField01',
      data_value: '100'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce3'),
    event_id: ObjectID('5981f167212b348aed7fa9f7'),
    data_source: 'framegrabber',
    data_array: [{
      data_name: 'camera_name',
      data_value: 'Camera 02'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_002.png'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce4'),
    event_id: ObjectID('5981f167212b348aed7fa9f7'),
    data_source: 'vehicleRealtimeNavData',
    data_array: [{
      data_name: 'latitude',
      data_value: '41.342981',
      data_uom: 'ddeg'
    },{
      data_name: 'longitude',
      data_value: '-170.236345',
      data_uom: 'ddeg'
    },{
      data_name: 'depth',
      data_value: '943.2',
      data_uom: 'meters'
    },{
      data_name: 'heading',
      data_value: '75.2',
      data_uom: 'deg'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce5'),
    event_id: ObjectID('5981f167212b348aed7fa9f8'),
    data_source: 'framegrabber',
    data_array: [{
      data_name: 'camera_name',
      data_value: 'Camera 03'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_003.png'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce6'),
    event_id: ObjectID('5981f167212b348aed7fa9f8'),
    data_source: 'vehicleRealtimeNavData',
    data_array: [{
      data_name: 'latitude',
      data_value: '41.342981',
      data_uom: 'ddeg'
    },{
      data_name: 'longitude',
      data_value: '-170.236345',
      data_uom: 'ddeg'
    },{
      data_name: 'depth',
      data_value: '943.2',
      data_uom: 'meters'
    },{
      data_name: 'heading',
      data_value: '75.2',
      data_uom: 'deg'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce7'),
    event_id: ObjectID('5981f167212b348aed7fa9f9'),
    data_source: 'framegrabber',
    data_array: [{
      data_name: 'camera_name',
      data_value: 'Camera 01'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_001.png'
    },{
      data_name: 'camera_name',
      data_value: 'Camera 02'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_002.png'
    },{
      data_name: 'camera_name',
      data_value: 'Camera 03'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_003.png'
    },{
      data_name: 'camera_name',
      data_value: 'Camera 04'
    },{
      data_name: 'filename',
      data_value: './path/framegrab_004.png'
    }]
  },
  {
    _id: ObjectID('5a7341898c1553258f703ce8'),
    event_id: ObjectID('5981f167212b348aed7fa9f9'),
    data_source: 'vehicleRealtimeNavData',
    data_array: [{
      data_name: 'latitude',
      data_value: '41.342981',
      data_uom: 'ddeg'
    },{
      data_name: 'longitude',
      data_value: '-170.236345',
      data_uom: 'ddeg'
    },{
      data_name: 'depth',
      data_value: '943.2',
      data_uom: 'meters'
    },{
      data_name: 'heading',
      data_value: '75.2',
      data_uom: 'deg'
    }]
  }
];

const event_templates_develDB_data = [
  {
    _id: ObjectID('5a71c3d7fa96aa1977822b2c'),
    event_name: 'FISH',
    event_value: 'FISH',
    event_free_text_required: false,
    system_template: false,
    template_categories: ['biology'],
    disabled: false,
    event_options: [{
      event_option_name: 'Status',
      event_option_type: 'dropdown',
      event_option_default_value: '',
      event_option_values: ['alive','dead','undead'],
      event_option_allow_freeform: false,
      event_option_required: false
    }]
  },
  {
    _id: ObjectID('5a71c3d7fa96aa1977822b2d'),
    event_name: 'ROCK',
    event_value: 'ROCK',
    event_free_text_required: false,
    system_template: false,
    template_categories: ['geology'],
    disabled: false,
    event_options: [{
      event_option_name: 'Color',
      event_option_type: 'dropdown',
      event_option_default_value: '',
      event_option_values: ['black','red','green'],
      event_option_allow_freeform: false,
      event_option_required: false
    }]
  },
  {
    _id: ObjectID('5a71c3d7fa96aa1977822b2e'),
    event_name: 'CORAL',
    event_value: 'CORAL',
    event_free_text_required: false,
    system_template: false,
    template_categories: ['biology'],
    disabled: false,
    event_options: [{
      event_option_name: 'Color',
      event_option_type: 'dropdown',
      event_option_default_value: '',
      event_option_values: ['black','red','purple'],
      event_option_allow_freeform: false,
      event_option_required: false
    }]
  },
  {
    _id: ObjectID('5a71c3d7fa96aa1977822b2f'),
    event_name: 'CRAB',
    event_value: 'CRAB',
    event_free_text_required: false,
    system_template: false,
    template_categories: ['biology'],
    disabled: false,
    event_options: [{
      event_option_name: 'Color',
      event_option_type: 'dropdown',
      event_option_default_value: '',
      event_option_values: ['blue','red','green'],
      event_option_allow_freeform: false,
      event_option_required: false
    }]
  },
  {
    _id: ObjectID('5a71c3d7fa96aa1977822b30'),
    event_name: 'SQUID',
    event_value: 'SQUID',
    event_free_text_required: false,
    system_template: false,
    template_categories: ['biology'],
    disabled: false,
    event_options: [{
      event_option_name: 'Color',
      event_option_type: 'dropdown',
      event_option_default_value: '',
      event_option_values: ['purple','red','pink'],
      event_option_allow_freeform: false,
      event_option_required: false
    }]
  },
  {
    _id: ObjectID('5a71c3d7fa96aa1977822b31'),
    event_name: 'SAMPLE',
    event_value: 'SAMPLE',
    event_free_text_required: false,
    system_template: true,
    template_categories: ['operations'],
    disabled: false,
    event_options: [
      {
        event_option_allow_freeform: false,
        event_option_name: 'Sample ID',
        event_option_required: true,
        event_option_type: 'text',
        event_option_values: []
      },
      {
        event_option_allow_freeform: false,
        event_option_name: 'Sample Type',
        event_option_required: true,
        event_option_type: 'dropdown',
        event_option_values: ['push core','physical sample','fluid sample','slurp','majors','gas tight','hog bio', 'hog chem']
      }
    ]
  },
  {
    '_id': ObjectID('5a71c3d7fa96aa1977822b32'),
    event_name: 'PROBLEM',
    event_value: 'PROBLEM',
    event_free_text_required: false,
    system_template: true,
    template_categories: ['operations'],
    disabled: false,
    event_options: []
  },
  {
    '_id': ObjectID('5a71c3d7fa96aa1977822b33'),
    event_name: 'SUPER_EVENT',
    event_value: 'SUPER_EVENT',
    event_free_text_required: false,
    system_template: false,
    template_categories: ['biology','geology','operations'],
    disabled: false,
    event_options: [
      {
        event_option_allow_freeform: false,
        event_option_name: 'first text option',
        event_option_required: false,
        event_option_type: 'text',
        event_option_values: []
      },
      {
        event_option_allow_freeform: false,
        event_option_name: 'second text option',
        event_option_required: true,
        event_option_type: 'text',
        event_option_values: []
      },
      {
        event_option_allow_freeform: false,
        event_option_name: 'first checkbox option',
        event_option_required: false,
        event_option_type: 'checkboxes',
        event_option_values: ['1','2','3','4']
      },
      {
        event_option_allow_freeform: false,
        event_option_name: 'first select option',
        event_option_required: false,
        event_option_type: 'dropdown',
        event_option_values: ['1','2','3','4']
      },
      {
        event_option_allow_freeform: false,
        event_option_default_value: '1',
        event_option_name: 'second select option',
        event_option_required: false,
        event_option_type: 'dropdown',
        event_option_values: ['1','2','3','4']
      },
      {
        event_option_allow_freeform: false,
        event_option_name: 'third select option',
        event_option_required: true,
        event_option_type: 'dropdown',
        event_option_values: ['1','2','3','4']
      },
      {
        event_option_allow_freeform: false,
        event_option_default_value: '1',
        event_option_name: 'fourth select option',
        event_option_required: true,
        event_option_type: 'dropdown',
        event_option_values: ['1','2','3','4']
      }
    ]
  }
];

const events_develDB_data = [
  {
    _id: ObjectID('5981f167212b348aed7fa9f5'),
    event_author: 'admin',
    ts: new Date('2017/06/14 19:01:00Z'),
    event_value: 'FISH',
    event_options: [{
      event_option_name: 'status',
      event_option_value: 'alive'
    }],
    event_free_text: 'some free text'
  }, {
    _id: ObjectID('5981f167212b348aed7fa9f6'),
    event_author: 'user',
    ts: new Date('2017/06/14 19:11:00Z'),
    event_value: 'CORAL',
    event_options: [{
      event_option_name: 'status',
      event_option_value: 'alive'
    }],
    event_free_text: 'some more text'
  }, {
    _id: ObjectID('5981f167212b348aed7fa9f7'),
    event_author: 'user',
    ts: new Date('2017/06/14 19:21:00Z'),
    event_value: 'FISH',
    event_options: [{
      event_option_name: 'status',
      event_option_value: 'alive'
    }],
    event_free_text: 'some other text'
  }, {
    _id: ObjectID('5981f167212b348aed7fa9f8'),
    event_author: 'admin',
    ts: new Date('2017/06/14 19:31:00Z'),
    event_value: 'FISH',
    event_options: [{
      event_option_name: 'status',
      event_option_value: 'alive'
    }],
    event_free_text: 'some misc text'
  }, {
    _id: ObjectID('5981f167212b348aed7fa9f9'),
    event_author: 'admin',
    ts: new Date('2017/06/14 19:41:00Z'),
    event_value: 'FISH',
    event_options: [{
      event_option_name: 'status',
      event_option_value: 'dead'
    }],
    event_free_text: 'some free text'
  }
];

const lowerings_develDB_data = [
  {
    _id: ObjectID('6981f167212b348aed7fa9f5'),
    lowering_id: '4928',
    start_ts: new Date('2017/06/14 18:00:00Z'),
    stop_ts: new Date('2017/06/15 02:00:00Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: 'Jaco Scar, Costa Rica',
    lowering_tags: ['engineering'],
    lowering_hidden: false
  },
  {
    _id: ObjectID('6981f167212b348aed7fa9f6'),
    lowering_id: '4929',
    start_ts: new Date('2017/06/15 18:00:00Z'),
    stop_ts: new Date('2017/06/16 02:00:00Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: 'Jaco Scar, Costa Rica',
    lowering_tags: ['engineering'],
    lowering_hidden: false
  },
  {
    _id: ObjectID('6981f167212b348aed7fa9f7'),
    lowering_id: '4930',
    start_ts: new Date('2017/06/22 18:00:00Z'),
    stop_ts: new Date('2017/06/23 02:00:00Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: '4500m site nw of Mayaguana Is, Costa Rica',
    lowering_tags: ['engineering'],
    lowering_access_list: ['5981f167212b348aed7fd9f5'],
    lowering_hidden: true
  },
  {
    _id: ObjectID('6981f167212b348aed7fa9f8'),
    lowering_id: '4906',
    start_ts: new Date('2017/05/21 18:00:00Z'),
    stop_ts: new Date('2017/05/22 02:00:00Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: 'Mound 12, Costa Rica',
    lowering_tags: ['coral'],
    lowering_hidden: false
  },
  {
    _id: ObjectID('6981f167212b348aed7fa9f9'),
    lowering_id: '4907',
    start_ts: new Date('2017/05/22 18:00:00Z'),
    stop_ts: new Date('2017/05/23 02:00:00Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: 'Mound 12, Costa Rica',
    lowering_tags: ['coral'],
    lowering_hidden: false
  },
  {
    _id: ObjectID('6981f167212b348aed7fa9fa'),
    lowering_id: '4908',
    start_ts: new Date('2017/05/23 18:00:00Z'),
    stop_ts: new Date('2017/05/24 02:00:00Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: 'Mound 12, Costa Rica',
    lowering_tags: ['coral'],
    lowering_hidden: false
  },
  {
    _id: ObjectID('6981f167212b348aed7fa9fb'),
    lowering_id: '4790',
    start_ts: new Date('2015/06/20 13:11:54Z'),
    stop_ts: new Date('2015/06/20 19:58:06Z'),
    lowering_additional_meta: {
      lowering_description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    },
    lowering_location: 'Gulf of Mexico',
    lowering_tags: [],
    lowering_hidden: true
  }
];

const users_init_data = [
  {
    _id: ObjectID('5981f167212b348aed7fa9f5'),
    username: 'admin',
    fullname: 'Admin',
    email: 'admin@notarealserver.com',
    password: hashedPassword('demo'),
    last_login: new Date(),
    roles: ['admin', 'event_watcher', 'event_logger', 'event_manager', 'cruise_manager'],
    system_user: true,
    disabled: false,
    loginToken: randomAsciiString(20)
  },
  {
    _id: ObjectID('5981f167212b348aed7fb9f5'),
    username: 'guest',
    fullname: 'Guest',
    email: 'guest@notarealserver.com',
    password: hashedPassword(''),
    last_login: new Date(),
    roles: ['event_manager', 'event_logger', 'event_watcher'],
    system_user: true,
    disabled: false,
    loginToken: randomAsciiString(20)
  },
  {
    _id: ObjectID('5981f167212b348aed7fc9f5'),
    username: 'pi',
    fullname: 'Primary Investigator',
    email: 'pi@notarealserver.com',
    password: hashedPassword(''),
    last_login: new Date(),
    roles: ['event_manager', 'event_logger', 'event_watcher', 'cruise_manager'],
    system_user: true,
    disabled: false,
    loginToken: randomAsciiString(20)
  }
];

module.exports = {
  cruises_develDB_data,
  custom_vars_init_data,
  event_aux_data_develDB_data,
  event_templates_develDB_data,
  events_develDB_data,
  lowerings_develDB_data,
  users_init_data
};
