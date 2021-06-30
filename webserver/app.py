'''
Tell Me What I’m Remembering
Project
Author : Sunkyo Kim, Eunsang Hwang
'''
from flask import Flask
from flask import render_template
from flask import request
import json
import os

app=Flask(__name__)

def logger():
    import logging
    import logging.config
    from datetime import datetime

    log_dir='./log'
    #check log directory
    if os.path.isdir(log_dir) is False:
        os.mkdir(log_dir)
    log_file=os.path.join(log_dir,datetime.today().strftime("%Y%m%d%H%M%S")+'.log')

    #init logging
    logging.config.fileConfig("./logger.conf",defaults={"str_log_file_name":log_file})
    log = logging.getLogger()

    return log

@app.route('/')
def title(name=None):
    return 'hello'
    # return render_template('record.html',name=name)

# @app.route('/recv', methods=['POST'])
# def recv(name=None):
#     if request.method == 'POST':
#         return 'Hello'
#     else:
#         log.error(f'request type error : {request.method}')

    

if __name__ =="__main__":
    global log
    log=logger()
    # app.run(host="127.0.0.1", port=5000,ssl_context='adhoc')
    app.run(host="127.0.0.1", port=5000)