#!/usr/bin/env python3
'''
FILE:           base_data_exporter.py

DESCRIPTION:    Base class providing shared infrastructure for Sealog data
                export scripts (vessel and vehicle variants).

AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2026-04-18
REVISION:   2026-04-18

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import sys
import os
import logging
import tempfile
import subprocess

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import API_SERVER_FILE_PATH


class SealogDataExporter:  # pylint:disable=R0903
    """Shared infrastructure for Sealog data export (file I/O, rsync, directories)."""

    IMAGES_DIRNAME = 'Images'
    FILES_DIRNAME = 'Files'

    def __init__(self, name, export_root_dir, export_images=True,
                 image_datasources=None, export_templates=False):
        self.name = name
        self.export_root_dir = export_root_dir
        self.export_images = export_images
        self.image_datasources = image_datasources or []
        self.export_templates = export_templates
        self.cruises_file_path = os.path.join(API_SERVER_FILE_PATH, 'cruises')
        self.images_file_path = os.path.join(API_SERVER_FILE_PATH, 'images')

    def _cruise_file_prefix(self, cruise):
        return f"{cruise['cruise_id']}_{self.name}"

    @staticmethod
    def _write_file(filepath, content, description):
        """Write content to filepath, logging the operation. Skips if content is None."""
        if content is None:
            logging.warning("Skipping %s: no data returned", description)
            return
        logging.info("Export %s: %s", description, os.path.basename(filepath))
        try:
            with open(filepath, 'w', encoding='utf-8') as file:
                file.write(content)
        except OSError as exc:
            logging.error('Could not create data file: %s', filepath)
            logging.debug(str(exc))

    @staticmethod
    def _make_dir(path):
        """Create a directory (and any missing parents), exiting on failure."""
        try:
            os.makedirs(path, exist_ok=True)
        except OSError as exc:
            logging.error("Could not create directory: %s", path)
            logging.debug(str(exc))
            sys.exit(1)

    def _build_export_directories(self, dirs):
        for path in dirs.values():
            self._make_dir(path)

    def _rsync_images(self, framegrab_list, images_dir):
        """
        Sync framegrab files into images_dir via rsync, deleting stale images.
        framegrab_list is a list of source file paths.
        """
        existing = set(os.listdir(images_dir))
        to_delete = existing - {os.path.basename(f) for f in framegrab_list}
        for filename in to_delete:
            try:
                logging.info('Deleting: %s', filename)
                os.remove(os.path.join(images_dir, filename))
            except OSError as exc:
                logging.debug(str(exc))

        with tempfile.NamedTemporaryFile(mode='w+b', delete=False) as file:
            for framegrab in framegrab_list:
                file.write(str.encode(os.path.basename(framegrab) + '\n'))

            subprocess.call([
                'rsync', '-avi', '--progress',
                '--files-from=' + file.name,
                os.path.join(self.images_file_path, ''),
                images_dir
            ])

    def _export_cruise_files(self, cruise, cruise_dir):
        """Rsync the cruise's uploaded files into the export directory."""
        subprocess.call([
            'rsync', '-avi', '--progress', '--delete',
            os.path.join(self.cruises_file_path, cruise['id'], ''),
            os.path.join(cruise_dir, self.FILES_DIRNAME)
        ])

    def verify_source_directories(self, cruise, lowerings=None):  # pylint:disable=W0613
        """Verify that the cruise source directories exist."""
        logging.info("Verifying source directories")
        checks = [
            (self.cruises_file_path,
             "cannot find cruises file path"),
            (os.path.join(self.cruises_file_path, cruise['id']),
             f"cannot find source directory for cruise: {cruise['cruise_id']}"),
        ]
        for path, message in checks:
            if not os.path.isdir(path):
                return False, message
        return True, 'success'
