const Joi = require('joi');

const {
  useAccessControl
} = require('../config/email_constants');

// users
// ----------------------------------------------------------------------------

const userID = Joi.string().label('userID');


// auth
// ----------------------------------------------------------------------------

const authorizationHeader = Joi.object({
  Authorization: Joi.string().regex(/^Bearer [A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/)
}).options({ allowUnknown: true }).label('authorizationHeader');

const registerPayload = Joi.object({
  reCaptcha: Joi.string().optional(),
  username: Joi.string().min(1).max(50).required(),
  fullname: Joi.string().min(1).max(50).required(),
  email: Joi.string().min(1).max(50).required(),
  password: Joi.string().allow('').max(50).required()
}).label('registerPayload');

const resetPasswordPayload = Joi.object({
  token: Joi.string().required(),
  reCaptcha: Joi.string().optional(),
  password: Joi.string().allow('').max(50).required()
}).label('resetPasswordPayload');

const loginToken = Joi.object({
  loginToken: Joi.string().min(20).max(20).required()
}).label('loginToken');

const autoLoginPayload = Joi.object({
  reCaptcha: Joi.string().optional(),
  loginToken: Joi.string().min(20).max(20).required()
}).label('autoLoginPayload');

const loginSuccessResponse = Joi.object({
  token: Joi.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/),
  id: Joi.string()
}).label('loginSuccessResponse');

const forgotPasswordPayload = Joi.object({
  resetURL: Joi.string().uri().required(),
  email: Joi.string().min(1).max(50).required(),
  reCaptcha: Joi.string().optional()
}).label('forgotPasswordPayload');

const forgotPasswordSuccessResponse = Joi.object({
  statusCode: Joi.number().integer(),
  message: Joi.string()
}).label('forgotPasswordSuccessResponse');

const userToken = Joi.object({
  token: Joi.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/)
}).label('user JWT');

const userPassPayload = Joi.object({
  reCaptcha: Joi.string().optional(),
  username: Joi.string().min(1).max(50).required(),
  password: Joi.string().allow('').max(50).required()
}).label('userPassPayload');

const loginPayload = Joi.alternatives().try(
  userPassPayload,
  autoLoginPayload
).label('loginPayload');


// custom_vars
// ----------------------------------------------------------------------------

const customVarParam = Joi.object({
  id: Joi.string().length(24)
}).label('customVarParam');

const customVarQuery = Joi.object({
  name: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ).optional()
  // name: Joi.string()
}).label('customVarQuery');

const customVarResponse = Joi.object({
  id: Joi.object(),
  custom_var_name: Joi.string(),
  custom_var_value: Joi.string().allow('')
}).label('customVarResponse');

const customVarSuccessResponse = Joi.alternatives().try(
  customVarResponse,
  Joi.array().items(customVarResponse)
).label('customVarSuccessResponse');

const customVarUpdatePayload = Joi.object({
  custom_var_name: Joi.string().optional(),
  custom_var_value: Joi.string().allow('').optional()
}).required().min(1).label('customVarUpdatePayload');


// db
// ----------------------------------------------------------------------------

const databaseInsertResponse = Joi.object({
  acknowledged: Joi.boolean(),
  insertedId: Joi.object()
}).label('databaseInsertResponse');


// cruises
// ----------------------------------------------------------------------------

const cruiseTag = Joi.string().label('cruiseTag');

const cruiseParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('cruiseParam');

const cruiseAdditionalMetaCreate = Joi.object({
  cruise_name: Joi.string().optional(),
  cruise_vessel: Joi.string(),
  cruise_pi: Joi.string(),
  cruise_departure_location: Joi.string(),
  cruise_arrival_location: Joi.string()
}).options({ allowUnknown: true }).label('cruiseAdditionalMetaCreate');

const cruiseAdditionalMetaUpdate = Joi.object({
  cruise_name: Joi.string().optional(),
  cruise_vessel: Joi.string().optional(),
  cruise_pi: Joi.string().optional(),
  cruise_departure_location: Joi.string().optional(),
  cruise_arrival_location: Joi.string().optional()
}).options({ allowUnknown: true }).label('cruiseAdditionalMetaUpdate');

const cruiseQuery = Joi.object({
  startTS: Joi.date().iso(),
  stopTS: Joi.date().iso(),
  hidden: Joi.boolean().optional(),
  cruise_id: Joi.string().optional(),
  cruise_vessel: Joi.string().optional(),
  cruise_location: Joi.string().optional(),
  cruise_pi: Joi.string().optional(),
  cruise_tags: Joi.array().items(cruiseTag).optional(),
  format: Joi.string().valid('json','csv').optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional()
}).optional().label('cruiseQuery');

const singleCruiseQuery = Joi.object({
  format: Joi.string().valid('json','csv').optional()
}).optional().label('singleCruiseQuery');

const cruiseResponseAccessControl = Joi.object({
  id: Joi.object(),
  cruise_id: Joi.string(),
  start_ts: Joi.date().iso(),
  stop_ts: Joi.date().iso(),
  cruise_location: Joi.string().allow(''),
  cruise_additional_meta: cruiseAdditionalMetaCreate,
  cruise_tags: Joi.array().items(cruiseTag),
  cruise_access_list: Joi.array().items(userID),
  cruise_hidden: Joi.boolean()
}).label('cruiseResponse');

const cruiseResponseNoAccessControl = cruiseResponseAccessControl.keys({ cruise_access_list: Joi.forbidden() }).label('cruiseResponse');

const cruiseCreatePayloadAccessControl = Joi.object({
  id: Joi.string().length(24).optional(),
  cruise_id: Joi.string().required(),
  start_ts: Joi.date().iso().required(),
  stop_ts: Joi.date().iso().required(),
  cruise_location: Joi.string().allow('').required(),
  cruise_additional_meta: cruiseAdditionalMetaCreate.required(),
  cruise_tags: Joi.array().items(cruiseTag).required(),
  cruise_access_list: Joi.array().items(userID).optional(),
  cruise_hidden: Joi.boolean().optional()
}).label('cruiseCreatePayloadAccessControl');

const cruiseCreatePayloadNoAccessControl = cruiseCreatePayloadAccessControl.keys({ cruise_access_list: Joi.forbidden() }).label('cruiseCreatePayload');

const cruiseCreatePayload = (useAccessControl) ? cruiseCreatePayloadAccessControl.label('cruiseCreatePayload') : cruiseCreatePayloadNoAccessControl.label('cruiseCreatePayload');

const cruiseUpdatePayloadAccessControl = Joi.object({
  cruise_id: Joi.string().optional(),
  start_ts: Joi.date().iso().optional(),
  stop_ts: Joi.date().iso().optional(),
  cruise_location: Joi.string().allow('').optional(),
  cruise_additional_meta: cruiseAdditionalMetaUpdate.optional(),
  cruise_tags: Joi.array().items(cruiseTag).optional(),
  cruise_access_list: Joi.array().items(userID).optional(),
  cruise_hidden: Joi.boolean().optional()
}).required().min(1).label('cruiseUpdatePayloadAccessControl');

const cruiseUpdatePayloadNoAccessControl = cruiseUpdatePayloadAccessControl.keys({ cruise_access_list: Joi.forbidden() }).label('cruiseUpdatePayloadNoAccessControl');

const cruiseUpdatePayload = (useAccessControl) ? cruiseUpdatePayloadAccessControl.label('cruiseUpdatePayload') : cruiseUpdatePayloadNoAccessControl.label('cruiseUpdatePayload');

const cruiseUpdatePermissionsPayload = Joi.object({
  add: Joi.array().items(userID).optional(),
  remove: Joi.array().items(userID).optional()
}).required().min(1).label('cruiseUpdatePermissionsPayload');

const cruiseSuccessResponse = Joi.alternatives().try(
  Joi.string(),
  (useAccessControl) ? cruiseResponseAccessControl : cruiseResponseNoAccessControl,
  Joi.array().items((useAccessControl) ? cruiseResponseAccessControl : cruiseResponseNoAccessControl)
).label('cruiseSuccessResponse');


// event_aux_data
// ----------------------------------------------------------------------------

const auxDataParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('auxDataParam');

const auxDataDataItem = Joi.object({
  data_name: Joi.string().required(),
  data_value: Joi.alternatives().try(
    Joi.string(),
    Joi.number()
  ).required(),
  data_uom: Joi.string().optional()
}).label('auxDataDataItem');

const auxDataQuery = Joi.object({
  eventID: Joi.string().length(24).optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional(),
  author: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ).optional(),
  startTS: Joi.date().iso().optional(),
  stopTS: Joi.date().iso().optional(),
  datasource: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  freetext: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional()
}).optional().label('auxDataQuery');

const auxDataCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  event_id: Joi.string().length(24).required(),
  data_source: Joi.string().min(1).max(100).required(),
  data_array: Joi.array().items(auxDataDataItem)
}).label('auxDataCreatePayload');

const auxDataUpdatePayload = Joi.object({
  event_id: Joi.string().length(24).optional(),
  data_source: Joi.string().min(1).max(100).optional(),
  data_array: Joi.array().items(auxDataDataItem).optional()
}).required().min(1).label('auxDataUpdatePayload');

const auxDataResponse = Joi.object({
  id: Joi.object(),
  event_id: Joi.object(),
  data_source: Joi.string(),
  data_array: Joi.array().items(auxDataDataItem)
}).label('auxDataResponse');

const auxDataSuccessResponse = Joi.alternatives().try(
  auxDataResponse,
  Joi.array().items(auxDataResponse)
).label('auxDataSuccessResponse');


// event_exports
// ----------------------------------------------------------------------------

const eventExportResponse = Joi.object({
  id: Joi.object(),
  event_author: Joi.string(),
  ts: Joi.date().iso(),
  event_value: Joi.string(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string(),
    event_option_value: Joi.string().allow('')
  })),
  event_free_text: Joi.string().allow(''),
  aux_data: Joi.array().items(Joi.object({
    id: Joi.object(),
    data_source: Joi.string(),
    data_array: Joi.array().items(Joi.object({
      data_name: Joi.string(),
      data_value: Joi.alternatives().try(
        Joi.string(),
        Joi.number()
      ),
      data_uom: Joi.string()
    }))
  })),
  cruise_id: Joi.string().optional(),
  lowering_id: Joi.string().optional()
}).label('eventExportSuccessResponse');

const eventExportSuccessResponse = Joi.alternatives().try(
  Joi.string(),
  eventExportResponse,
  Joi.array().items(eventExportResponse)
).label('eventExportSuccessResponse');

const eventExportQuery = Joi.object({
  format: Joi.string().valid('json','csv').optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional(),
  author: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ).optional(),
  startTS: Joi.date().optional(),
  stopTS: Joi.date().optional(),
  datasource: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ).optional(),
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ).optional(),
  freetext: Joi.string().optional(),
  add_record_ids: Joi.boolean().optional()
}).optional().label('eventExportQuery');

const eventExportSingleQuery = Joi.object({
  format: Joi.string().valid('json','csv').optional(),
  add_record_ids: Joi.boolean().optional()
}).optional().label('eventExportSingleQuery');

// event_templates
// ----------------------------------------------------------------------------

const eventTemplateParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('eventTemplateParam');

const eventTemplateQuery = Joi.object({
  system_template: Joi.boolean().optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional(),
  sort: Joi.string().valid('event_name').optional()
}).optional().label('eventTemplateQuery');

const eventTemplateResponse = Joi.object({
  id: Joi.object(),
  event_name: Joi.string(),
  event_value: Joi.string(),
  event_free_text_required: Joi.boolean(),
  system_template: Joi.boolean(),
  template_categories: Joi.array().items(Joi.string()),
  template_style: Joi.object().optional(),
  disabled: Joi.boolean().optional(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string(),
    event_option_type: Joi.string(),
    event_option_default_value: Joi.string().allow(''),
    event_option_values: Joi.array().items(Joi.string()),
    event_option_allow_freeform: Joi.boolean(),
    event_option_required: Joi.boolean()
  }))
}).label('eventTemplateResponse');

const eventTemplateCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  event_name: Joi.string().required(),
  event_value: Joi.string().required(),
  event_free_text_required: Joi.boolean().required(),
  system_template: Joi.boolean().required(),
  template_categories: Joi.array().items(Joi.string()).optional(),
  template_style: Joi.object(),
  disabled: Joi.boolean().optional(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string().required(),
    event_option_type: Joi.string().required(),
    event_option_default_value: Joi.string().allow('').optional(),
    event_option_values: Joi.array().items(Joi.string()).required(),
    event_option_allow_freeform: Joi.boolean().required(),
    event_option_required: Joi.boolean().required()
  })).optional()
}).label('eventTemplateCreatePayload');

const eventTemplateUpdatePayload = Joi.object({
  event_name: Joi.string().optional(),
  event_value: Joi.string().optional(),
  event_free_text_required: Joi.boolean().optional(),
  system_template: Joi.boolean().optional(),
  template_categories: Joi.array().items(Joi.string()).optional(),
  template_style: Joi.object().optional(),
  disabled: Joi.boolean().optional(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string().required(),
    event_option_type: Joi.string().required(),
    event_option_default_value: Joi.string().allow('').optional(),
    event_option_values: Joi.array().items(Joi.string()).required(),
    event_option_allow_freeform: Joi.boolean().required(),
    event_option_required: Joi.boolean().required()
  })).optional()
}).required().min(1).label('eventTemplateUpdatePayload');

const eventTemplateSuccessResponse = Joi.alternatives().try(
  eventTemplateResponse,
  Joi.array().items(eventTemplateResponse)
).label('eventTemplateSuccessResponse');


// events
// ----------------------------------------------------------------------------

const eventParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('eventParam');

const eventCountSuccessResponse = Joi.object({
  events: Joi.number().integer()
}).label('eventCountSuccessResponse');

const eventQuery = Joi.object({
  format: Joi.string().valid('json','csv').optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional(),
  sort: Joi.string().optional(),
  author: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ),
  startTS: Joi.date().iso(),
  stopTS: Joi.date().iso(),
  datasource: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ),
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ),
  freetext: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).optional()
  ),
  add_record_ids: Joi.boolean().optional()
}).optional().label('eventQuery');

const eventResponse = Joi.object({
  id: Joi.object(),
  event_author: Joi.string(),
  ts: Joi.date().iso(),
  event_value: Joi.string(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string(),
    event_option_value: Joi.string().allow('')
  })),
  event_free_text: Joi.string().allow(''),
  cruise_id: Joi.string().optional(),
  lowering_id: Joi.string().optional()
}).label('eventResponse');

const eventSingleQuery = Joi.object({
  format: Joi.string().valid('json','csv').optional(),
  add_record_ids: Joi.boolean().optional()
}).optional().label('eventSingleQuery');

const eventSuccessResponse = Joi.alternatives().try(
  Joi.string(),
  eventResponse,
  Joi.array().items(eventResponse)
).label('eventSuccessResponse');

const eventCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  event_author: Joi.string().min(1).max(100).optional(),
  ts: Joi.date().iso().optional(),
  event_value: Joi.string().min(1).max(100).required(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string().required(),
    event_option_value: Joi.string().allow('').required()
  })).optional(),
  event_free_text: Joi.string().allow('').optional(),
  publish: Joi.boolean().optional()
}).label('eventCreatePayload');

const eventCreateResponse = Joi.object({
  acknowledged: Joi.boolean(),
  insertedId: Joi.object(),
  insertedEvent: eventSuccessResponse
}).label('eventCreateResponse');

const eventUpdatePayload = Joi.object({
  event_author: Joi.string().min(1).max(100).optional(),
  ts: Joi.date().iso().optional(),
  event_value: Joi.string().min(1).max(100).optional(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string().required(),
    event_option_value: Joi.string().allow('').required()
  })).optional(),
  event_free_text: Joi.string().allow('').optional()
}).required().min(1).label('eventUpdateResponse');


// lowerings
// ----------------------------------------------------------------------------

const loweringParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('loweringParam');

const loweringTag = Joi.string().label('loweringTag');

const loweringCreatePayloadAccessControl = Joi.object({
  id: Joi.string().length(24).optional(),
  lowering_id: Joi.string().required(),
  start_ts: Joi.date().iso().required(),
  stop_ts: Joi.date().iso().required(),
  lowering_additional_meta: Joi.object().required(),
  lowering_tags: Joi.array().items(loweringTag).required(),
  lowering_location: Joi.string().allow('').required(),
  lowering_access_list: Joi.array().items(userID).optional(),
  lowering_hidden: Joi.boolean().optional()
}).label('loweringCreatePayloadAccessControl');

const loweringCreatePayloadNoAccessControl = loweringCreatePayloadAccessControl.keys({ lowering_access_list: Joi.forbidden() }).label('loweringCreatePayloadNoAccessControl');

const loweringCreatePayload = (useAccessControl) ? loweringCreatePayloadAccessControl.label('loweringCreatePayload') : loweringCreatePayloadNoAccessControl.label('loweringCreatePayload');

const loweringUpdatePayloadAccessControl = Joi.object({
  lowering_id: Joi.string().optional(),
  start_ts: Joi.date().iso().optional(),
  stop_ts: Joi.date().iso().optional(),
  lowering_additional_meta: Joi.object().optional(),
  lowering_tags: Joi.array().items(loweringTag).optional(),
  lowering_location: Joi.string().allow('').optional(),
  lowering_access_list: Joi.array().items(userID).optional(),
  lowering_hidden: Joi.boolean().optional()
}).required().min(1).label('loweringUpdatePayloadAccessControl');

const loweringUpdatePayloadNoAccessControl = loweringUpdatePayloadAccessControl.keys({ lowering_access_list: Joi.forbidden() }).label('loweringUpdatePayloadNoAccessControl');

const loweringUpdatePayload = (useAccessControl) ? loweringUpdatePayloadAccessControl.label('loweringUpdatePayload') : loweringUpdatePayloadNoAccessControl.label('loweringUpdatePayload');

const loweringQuery = Joi.object({
  lowering_id: Joi.string().optional(),
  startTS: Joi.date().iso(),
  stopTS: Joi.date().iso(),
  lowering_location: Joi.string().optional(),
  lowering_tags: Joi.alternatives().try(
    loweringTag,
    Joi.array().items(loweringTag)
  ).optional(),
  format: Joi.string().valid('json','csv').optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional()
}).optional().label('loweringQuery');

const singleLoweringQuery = Joi.object({
  format: Joi.string().valid('json','csv').optional()
}).optional().label('singleLoweringQuery');

const loweringResponseAccessControl = Joi.object({
  id: Joi.object(),
  lowering_id: Joi.string(),
  start_ts: Joi.date().iso(),
  stop_ts: Joi.date().iso(),
  lowering_additional_meta: Joi.object(),
  lowering_tags: Joi.array().items(loweringTag),
  lowering_location: Joi.string().allow(''),
  lowering_access_list: Joi.array().items(userID),
  lowering_hidden: Joi.boolean()
}).label('loweringResponseAccessControl');

const loweringResponseNoAccessControl = loweringResponseAccessControl.keys({ lowering_access_list: Joi.forbidden() }).label('loweringResponseNoAccessControl');

const loweringUpdatePermissionsPayload = Joi.object({
  add: Joi.array().items(userID).optional(),
  remove: Joi.array().items(userID).optional()
}).required().min(1).label('loweringUpdatePermissionsPayload');

const loweringSuccessResponse = Joi.alternatives().try(
  Joi.string(),
  (useAccessControl) ? loweringResponseAccessControl : loweringResponseNoAccessControl,
  Joi.array().items((useAccessControl) ? loweringResponseAccessControl : loweringResponseNoAccessControl)
).label('loweringSuccessResponse');


// users
// ----------------------------------------------------------------------------

const userParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('userParam');

const userQuery = Joi.object({
  system_user: Joi.boolean().optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional(),
  sort: Joi.string().valid('username', 'last_login').optional()
}).optional().label('userQuery');

const userCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  username: Joi.string().min(1).max(100).required(),
  fullname: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().allow('').max(50).required(),
  roles: Joi.array().items(Joi.string()).min(1).required(),
  system_user: Joi.boolean().optional(),
  disabled: Joi.boolean().optional(),
  resetURL: Joi.string().uri().required()
}).label('userCreatePayload');

const userUpdatePayload = Joi.object({
  username: Joi.string().min(1).max(100).optional(),
  fullname: Joi.string().min(1).max(100).optional(),
  // email: Joi.string().email().optional(),
  password: Joi.string().allow('').max(50).optional(),
  roles: Joi.array().items(Joi.string()).min(1).optional(),
  system_user: Joi.boolean().optional(),
  disabled: Joi.boolean().optional()
}).required().min(1).label('userUpdatePayload');

const userResponse = Joi.object({
  id: Joi.object(),
  email: Joi.string().email(),
  system_user: Joi.boolean(),
  last_login: Joi.date(),
  username: Joi.string(),
  fullname: Joi.string(),
  roles: Joi.array().items(Joi.string()),
  disabled: Joi.boolean()
}).label('userResponse');

const userSuccessResponse = Joi.alternatives().try(
  userResponse,
  Joi.array().items(userResponse)
).label('userSuccessResponse');

module.exports = {
  authorizationHeader,
  autoLoginPayload,
  auxDataCreatePayload,
  auxDataDataItem,
  auxDataParam,
  auxDataQuery,
  auxDataSuccessResponse,
  auxDataUpdatePayload,
  cruiseAdditionalMetaCreate,
  cruiseAdditionalMetaUpdate,
  cruiseCreatePayload,
  cruiseCreatePayloadAccessControl,
  cruiseCreatePayloadNoAccessControl,
  cruiseParam,
  cruiseQuery,
  cruiseResponseAccessControl,
  cruiseResponseNoAccessControl,
  cruiseSuccessResponse,
  cruiseTag,
  cruiseUpdatePayload,
  cruiseUpdatePayloadAccessControl,
  cruiseUpdatePayloadNoAccessControl,
  cruiseUpdatePermissionsPayload,
  customVarParam,
  customVarQuery,
  customVarResponse,
  customVarSuccessResponse,
  customVarUpdatePayload,
  databaseInsertResponse,
  eventCountSuccessResponse,
  eventCreatePayload,
  eventCreateResponse,
  eventExportQuery,
  eventExportSingleQuery,
  eventExportSuccessResponse,
  eventParam,
  eventQuery,
  eventSingleQuery,
  eventSuccessResponse,
  eventTemplateCreatePayload,
  eventTemplateParam,
  eventTemplateQuery,
  eventTemplateSuccessResponse,
  eventTemplateUpdatePayload,
  eventUpdatePayload,
  forgotPasswordPayload,
  forgotPasswordSuccessResponse,
  loginPayload,
  loginSuccessResponse,
  loginToken,
  loweringCreatePayload,
  loweringCreatePayloadAccessControl,
  loweringCreatePayloadNoAccessControl,
  loweringParam,
  loweringQuery,
  loweringResponseAccessControl,
  loweringResponseNoAccessControl,
  loweringSuccessResponse,
  loweringTag,
  loweringUpdatePayload,
  loweringUpdatePayloadAccessControl,
  loweringUpdatePayloadNoAccessControl,
  loweringUpdatePermissionsPayload,
  registerPayload,
  resetPasswordPayload,
  singleCruiseQuery,
  singleLoweringQuery,
  userCreatePayload,
  userID,
  userParam,
  userPassPayload,
  userQuery,
  userSuccessResponse,
  userToken,
  userUpdatePayload
};
