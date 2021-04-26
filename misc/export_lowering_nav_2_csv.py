import json
import logging
import pandas as pd
from io import StringIO
from datetime import datetime

from python_sealog.lowerings import getLowerings, getLoweringByID
from python_sealog.event_exports import getEventExportsByLowering

desired_raw_columns = ['ts','vehicleRealtimeNavData.longitude_value','vehicleRealtimeNavData.latitude_value', 'vehicleRealtimeNavData.depth_value']
desired_proc_columns = ['datetime','longitude_ddeg','latitude_ddeg', 'depth_m']

ROUNDING = {
    'longitude_ddeg': 8,
    'latitude_ddeg': 8,
    'depth_m': 2
}

class ExportLoweringNav2CSV():

    def __init__(self, lowering_id=None, raw_columns=desired_raw_columns, proc_columns=desired_proc_columns, precision=ROUNDING):
        self.lowering_id = lowering_id
        self.raw_columns = raw_columns
        self.proc_columns = proc_columns
        self.precision = precision
        self.logger = logging.getLogger('ExportLoweringNav2CSV')

        self.export_lowering()

    def round_data(self):
        """
        Round the data to the specified precision
        """
        try:
            decimals = pd.Series(self.precision.values(), index=self.precision.keys())
            self.data = self.data.round(decimals)
        except Exception as err:
            logging.error("Could not round data")
            logging.error(str(err))
            raise err


    def export_lowering(self):

        # retieve specified lowering record
        logging.info("Retrieving lowering record")
        lowering = None
        if self.lowering_id is not None:
            lowering = getLoweringByID(self.lowering_id)
        else:
            lowering = getLowerings()[0]

        if not lowering:
          logging.error("Lowering %s not found." % self.lowering_id)
          return None

        logging.debug("Lowering:\n%s" % json.dumps(lowering, indent=2))

        logging.info("Extracting \"lowering_in_water\" and \"lowering_out_of_water\" timestamps")
        try:
            start_ts = datetime.strptime(lowering['lowering_additional_meta']['milestones']['lowering_in_water'], '%Y-%m-%dT%H:%M:%S.%fZ')
            end_ts = datetime.strptime(lowering['lowering_additional_meta']['milestones']['lowering_on_surface'], '%Y-%m-%dT%H:%M:%S.%fZ')
        except:
            logging.error("Problem extracting \"lowering_in_water\" and \"lowering_out_of_water\" timestamps")
            return None

        # get the events for the lowering
        logging.info("Exporting events for lowering")
        events = getEventExportsByLowering(lowering['id'], export_format='csv')

        if events is None:
            logging.error("No events found for lowering %s:" % self.lowering_id)
            return None

        file = StringIO(events)

        # import events into pandas dataframe
        logging.info("Importing events into dataframe for processing.")
        try:
            self.data = pd.read_csv(file, usecols=self.raw_columns)
            self.data['ts'] = pd.to_datetime(self.data['ts'], format='%Y-%m-%dT%H:%M:%S.%fZ')

        except Exception as err:
            logging.error("Error importing events data into dataframe")
            logging.error(str(err))
            return None

        logging.debug("Data:\n%s" % self.data.head())

        # crop the events
        logging.info("Cropping lowering events to \"lowering_in_water\" and \"lowering_out_of_water\" timestamps")
        self.data = self.data[(self.data['ts'] >= start_ts)]
        self.data = self.data[(self.data['ts'] <= end_ts)]

        # resample at 1min
        logging.info('Subsampling data to 1-minute')
        self.data.set_index('ts',inplace=True)
        self.data = self.data.resample('1T', label='left', closed='left').first()
        self.data.reset_index(inplace=True)

        # rename columns
        self.data.columns = self.proc_columns

        # round data
        logging.info("Rounding data: %s", self.precision)
        self.round_data()


    def __str__(self):
        return self.data.to_csv(index=False, na_rep='NAN', date_format='%Y-%m-%dT%H:%M:%SZ')


# -------------------------------------------------------------------------------------
# Main function
# -------------------------------------------------------------------------------------
if __name__ == "__main__":

    import os
    import sys
    import argparse

    parser = argparse.ArgumentParser(description='Export lowering navigation data to csv')
    parser.add_argument('-v', '--verbosity', dest='verbosity', default=0, action='count', help='Increase output verbosity, default level: warning')
    parser.add_argument('-o', '--outfile', type=str, metavar='outfile', help='Write output to specified outfile')
    parser.add_argument('-l','--lowering_id', type=str, help='The lowering_id to export')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).
  
    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    try:

        lowering_export = ExportLoweringNav2CSV(parsed_args.lowering_id)

        if parsed_args.outfile:
            logging.info("Saving nav export to %s" % parsed_args.outfile)

            try:
                with open(parsed_args.outfile, 'w') as out_file:

                    out_file.write(str(lowering_export))

            except IOError:
                logging.error("Error saving nav export file: %s", parsed_args.outfile)

        else:
            logging.info("Sending nav export to stdout")

            print(lowering_export)

    except KeyboardInterrupt:
        logging.warning('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)