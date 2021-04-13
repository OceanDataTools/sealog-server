import sys
import json
import logging
from urllib3.exceptions import NewConnectionError
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient
from influxdb_client.rest import ApiException
from .settings import influxBucket

class SealogInfluxAuxDataRecordBuilder():
    def __init__(self, influxdb_client, aux_data_config):
        self.influxdb_client = influxdb_client.query_api()
        self.query_measurements = aux_data_config['query_measurements']
        self.query_fields = list(aux_data_config['aux_record_lookup'].keys())
        self.aux_record_lookup = aux_data_config['aux_record_lookup']
        self.datasource = aux_data_config['data_source']
        self.logger = logging.getLogger(__name__)

    @staticmethod
    def _buildQueryRange(ts):
        try:
            start_ts = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ") - timedelta(minutes=1)
            return "start: {}, stop: {}".format(start_ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),ts)
        except:
            return None

    def _buildQuery(self, ts):

        query_range = self._buildQueryRange(ts)

        try:
            query = 'from(bucket: "{}")\
|> range({})\
|> filter(fn: (r) => {})\
|> filter(fn: (r) => {})\
|> sort(columns: ["_time"], desc: true)\
|> limit(n:1)'.format(influxBucket, query_range, ' or '.join([ 'r["_measurement"] == "{}"'.format(q_measurement) for q_measurement in self.query_measurements]), ' or '.join([ 'r["_field"] == "{}"'.format(q_field) for q_field in self.query_fields]))
        except Exception as err:
            logging.error("Error building query string")
            logging.error(" - Range: %s" % query_range)
            logging.error(" - Measurements: %s" % query_measurements)
            logging.error(" - Fields: %s" % query_fields)
            raise err

        logging.debug("Query: %s" % query)
        return query

    def _buildAuxDataDict(self, event_id, influx_query_result):

        aux_data_record = {
            'event_id': event_id,
            'data_source': self.datasource,
            'data_array': []
        }

        influx_data = { 
        }

        for table in influx_query_result:
            for record in table.records:

                influx_data[record.get_field()] = record.get_value()
        
        logging.debug("raw values: %s" % json.dumps(influx_data, indent=2))

        for key, value in self.aux_record_lookup.items():
            if "no_output" in value and value['no_output'] == True:
                continue

            output_value = influx_data[key]
            
            if "modify" in value:
                logging.debug("modify found in record")
                for mod_op in value['modify']:
                    if 'test' in mod_op:
                        logging.debug("test found in mod_op")
                        test_result = False
                        for test in mod_op['test']:
                            logging.debug(json.dumps(test))
                            
                            if 'field' in test:
                                if test['field'] not in influx_data:
                                    logging.error("test field data not in influx query")
                                    return None
                                
                                if 'eq' in test and influx_data[test['field']] == test['eq']:
                                    test_result = True
                                    break

                        if test_result and 'operation' in mod_op:
                            logging.debug("operation found in mod_op")
                            for operan in mod_op['operation']:
                                if 'multiply' in operan:
                                    output_value *= operan['multiply']

            aux_data_record['data_array'].append({
                'data_name': value['name'],
                'data_value': str(round(output_value, value['round'])) if 'round' in value else str(output_value),
                'data_uom': value['uom'] if 'uom' in value else ''
            })

        if len(aux_data_record['data_array']) > 0:
            return aux_data_record

        return None

    def buildAuxDataRecord(self, event):

        logging.debug("building query")
        query = self._buildQuery(event['ts'])

        logging.debug("Query: %s" % query)
        # run the query against the influxDB
        try:
            query_result = self.influxdb_client.query(query=query)

        except NewConnectionError:
            logging.error("InfluxDB connection error, verify URL: %s" % url)

        except ApiException as err:
            type, value, traceback = sys.exc_info()

            if str(value).startswith("(400)"):
                logging.error("InfluxDB API error, verify org: %s" % org)
            elif str(value).startswith("(401)"):
                logging.error("InfluxDB API error, verify token: %s" % token)
            elif str(value).startswith("(404)"):
                logging.error("InfluxDB API error, verify bucket: %s" % influxBucket)
            else:
                raise err

        except Exception as err:
            logging.error("Error with query:")
            logging.error(query.replace("|>", '\n'))
            logging.error(str(err))

        else:
            aux_data_record = self._buildAuxDataDict(event['id'], query_result)

            return aux_data_record

    @property
    def data_source(self):
        return self.datasource

    @property
    def measurements(self):
        return self.query_measurements

    @property
    def fields(self):
        return self.query_fields

    @property
    def record_lookup(self):
        return self.aux_record_lookup
