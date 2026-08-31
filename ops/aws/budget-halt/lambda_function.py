import json
import os

import boto3
from botocore.exceptions import ClientError


INSTANCE_NAME = os.environ['INSTANCE_NAME']
INSTANCE_REGION = os.environ['INSTANCE_REGION']


def lambda_handler(event, context):
    lightsail = boto3.client('lightsail', region_name=INSTANCE_REGION)
    state = lightsail.get_instance_state(instanceName=INSTANCE_NAME)['state']['name']

    if event.get('test_only') is True:
        result = {
            'instance': INSTANCE_NAME,
            'state': state,
            'action': 'test only; no change made',
        }
        print(json.dumps(result))
        return result

    for port in (80, 443):
        try:
            lightsail.close_instance_public_ports(
                instanceName=INSTANCE_NAME,
                portInfo={'fromPort': port, 'toPort': port, 'protocol': 'tcp'},
            )
        except ClientError as error:
            print(json.dumps({'port': port, 'close_error': str(error)}))

    if state not in ('stopped', 'stopping'):
        lightsail.stop_instance(instanceName=INSTANCE_NAME)

    result = {
        'instance': INSTANCE_NAME,
        'previous_state': state,
        'action': 'public web ports closed and stop requested',
        'sns_records': len(event.get('Records', [])),
    }
    print(json.dumps(result))
    return result
