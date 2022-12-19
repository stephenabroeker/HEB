//
//  HEB Image Object Detection Interface
//


var assert = require('assert');

const {Rekognition} = require('aws-sdk');

var exec = require('child_process').exec;

const fs = require('fs');

const http = require('http');

const logger = require('logger-line-number')

var mysql = require('sync-mysql');


const s3_config = { 
    region: "us-east-2",
    bucket: "test-heb"
};

var db_con;

var tmp_file = "/tmp/";


// console.log = function() {}


//
//  Create a complete image in the database.
//  That is image and labels.
//
//  Parameters:
//  
//  response : object : HTTP Response.
//  labels : array : required.
//  s3_region : string : required.
//  s3_bucket : string : required.
//  s3_object : string : required.
//  object_detect : boolean : required.
//

function create_image(response, file_name, url_name, labels, s3_region, 
                      s3_bucket, s3_object, object_detect) {
    logger.log('create_image(START)');
    logger.log('create_image(): file_name = ' + file_name);
    logger.log('create_image(): url_name = ' + url_name);
    logger.log('create_image(): labels = ' + labels);
    logger.log('create_image(): s3_region = ' + s3_region);
    logger.log('create_image(): s3_bucket = ' + s3_bucket);
    logger.log('create_image(): s3_object = ' + s3_object);
    logger.log('create_image(): object_detect = ' + object_detect);

    // Delete the current image if it exists.

    delete_image(s3_object);

    // Create the image.

    var query1 = "INSERT INTO images (" +
                    "file_name, " +
                    "url_name, " +
                    "label, " +
                    "s3_region, " +
                    "s3_bucket, " +
                    "object_detect, " +
                    "store_time " +
                ") VALUES (";

    if (file_name)
        query1 += "'" + file_name + "', ";
    else
        query1 += "NULL, ";

    if (url_name)
        query1 += "'" + url_name + "', ";
    else
        query1 += "NULL, ";

    query1 += "'" + s3_object + "', " +
              "'" + s3_region + "', " + 
              "'" + s3_bucket + "', " +
              object_detect + ", " + 
              "now()" +
        ")";

    logger.log('create_image(): query1 = ' + query1);
    db_con.query(query1);

    // Get the new Image ID.

    var query2 = "SELECT id " +
                 "FROM images " +
                 "WHERE (label = '" + s3_object + "')";

    logger.log('create_image(): query2 = ' + query2);
    const rows2 = db_con.query(query2);
    logger.log('create_image(): rows2.length() = ' + rows2.length);
    assert (rows2.length == 1);
    const image_id = rows2[0]["id"];

    // Create each Label.

    for (var index in labels)
        create_label(image_id, labels[index]);

    // Done.

    var obj = JSON.parse('{"image": {}}');

    const obj_image = print_image(response, image_id);
    obj["image"] = obj_image;

    const obj_out = JSON.stringify(obj, null, 4);
    response.write(obj_out);
    response.end();

    logger.log('create_image(END)');
}


//
//  Just create an image (no labels) in the database.
//  We first have to delete the old image.
//
//  Parameters:
//  
//      response : object.
//      file_param : string : optional.
//      url_param : string : optional.
//      label_param : string : optional.
//
//      Must have one of {file_param, url_param}.
//

function create_image_only(response, file_param, url_param, label_param) {
    logger.log('create_image_only(START)');

    if (file_param) 
        logger.log('create_image_only(): file_param = ' + file_param);
    else
        logger.log('create_image_only(): file_param is null');

    if (url_param) 
        logger.log('create_image_only(): url_param = ' + url_param);
    else
        logger.log('create_image_only(): url_param is null');

    if (label_param) 
        logger.log('create_image_only(): label_param = ' + label_param);
    else
        logger.log('create_image_only(): label_param is null');

    // Delete the current image if it exists.

    if (label_param == null) {
        if (file_param) {
            var words = file_param.split('/');
            label_param = words[words.length - 1];
        } else if (url_param) {
            var words = url_param.split('/');
            label_param = words[words.length - 1];
        } else {
            assert(0);
        }
    }

    delete_image(label_param);

    // Run the INSERT query.

    var query1 = "INSERT INTO images (" +
                    "file_name, " +
                    "url_name, " +
                    "label, " +
                    "s3_region, " +
                    "s3_bucket, " +
                    "object_detect, " +
                    "store_time " +
                ") VALUES (";

    if (file_param)
        query1 += "'" + file_param + "', ";
    else
        query1 += "NULL, ";

    if (url_param)
        query1 += "'" + url_param + "', ";
    else
        query1 += "NULL, ";

    query1 += 
            "'" + label_param + "', " + 
            "'" + s3_config.region + "', " + 
	    "'" + s3_config.bucket + "', " +
	    "FALSE, " + 
	    "now()" +
	")";

    logger.log('create_image_only(): query1 = ' + query1);
    db_con.query(query1);

    // Run the SELECT query.

    var query2 = "SELECT " +
                     "id, " +
                     "file_name, " +
                     "url_name, " +
                     "label, " +
                     "object_detect, " +
                     "store_time " +
                 "FROM images " +
                 "WHERE (label = '" + label_param + "')";

    logger.log('create_image_only(): query2 = ' + query2);
    const rows2 = db_con.query(query2);
    logger.log('create_image_only(): rows2.length() = ' + rows2.length);
    assert (rows2.length == 1);

    // Done.

    const row = rows2[0];

    var obj = JSON.parse('{"image": {}}');

    const obj_image = print_image(response, row['id']);
    obj["image"] = obj_image;

    const obj_out = JSON.stringify(obj, null, 4);
    response.write(obj_out);
    response.end();

    logger.log('create_image_only(END)');
}


//
//  Create a label and its children in the database.
//
//  Parameters:
//  
//  image_id : string : required.
//  label : array : required.
//

function create_label(image_id, label) {
    logger.log('create_label(START)');
    logger.log('create_label(): image_id = ' + image_id);
    logger.log('create_label(): label = ' + label);

    // Create the label.

    var query1 = "INSERT INTO labels (" +
                    "image_id, " +
                    "name, " +
                    "confidence " +
                ") VALUES (" +
                    "'" + image_id + "', " + 
                    "'" + label['Name'] + "', " +
                    label['Confidence'] + 
                ")";

    logger.log('create_label(): query1 = ' + query1);
    db_con.query(query1);

    // Get the new Label ID.

    var query2 = "SELECT id " +
                 "FROM labels " +
                 "WHERE (" +
                     "image_id = '" + image_id + "' AND " +
                     "name = '" + label['Name'] + "'" +
                 ")";

    logger.log('create_label(): query2 = ' + query2);
    const rows2 = db_con.query(query2);
    logger.log('create_label(): rows2.length() = ' + rows2.length);
    assert (rows2.length == 1);
    label_id = rows2[0]['id'];
    logger.log('create_label(): label_id = ' + label_id);

    // Create the specific label.

    for (var key in label) {
        logger.log('create_label(): key = ' + key);

        if (key == 'Aliases') {
            for (var index in label['Aliases']) {
                var query3 = "INSERT INTO aliases (" +
                                 "label_id, " +
                                 "name" +
                             ") VALUES (" +
                                 label_id + ", " +
                                 "'" + label['Aliases'][index]['Name'] + "'" +
                             ")";

                logger.log('create_label(): query3 = ' + query3);
                db_con.query(query3);
            }
        } else if (key == 'Categories') {
            for (var index in label['Categories']) {
                var query4 = "INSERT INTO categories (" +
                                 "label_id, " +
                                 "name " +
                             ") VALUES (" +
                                 label_id + ", " +
                                 "'" + label['Categories'][index]['Name'] + "'" +
                             ")";

                logger.log('create_label(): query4 = ' + query4);
                db_con.query(query4);
            }
        } else if (key == 'Confidence') {
            noop();
        } else if (key == 'Instances') {
            for (var index in label['Instances']) {
                var query5 = "INSERT INTO instances (" +
                                 "label_id, " +
                                 "bb_width, " +
                                 "bb_height, " +
                                 "bb_left, " +
                                 "bb_top, " +
                                 "confidence" +
                             ") VALUES (" +
                                 label_id + ", " +
                                 label['Instances'][index]['BoundingBox']['Width'] + ", " +
                                 label['Instances'][index]['BoundingBox']['Height'] + ", " +
                                 label['Instances'][index]['BoundingBox']['Left'] + ", " +
                                 label['Instances'][index]['BoundingBox']['Top'] + ", " + 
                                 label['Instances'][index]['Confidence'] + 
                             ")";

                logger.log('create_label(): query5 = ' + query5);
                db_con.query(query5);
            }
        } else if (key == 'Name') {
            noop();
        } else if (key == 'Parents') {
            for (var index in label['Parents']) {
                var query6 = "INSERT INTO parents (" +
                                 "label_id, " +
                                 "name " +
                             ") VALUES (" +
                                 label_id + ", " +
                                 "'" + label['Parents'][index]['Name'] + "'" +
                             ")";

                logger.log('create_label(): query6 = ' + query6);
                db_con.query(query6);
            }
        } else {
            assert(0);
        }
    }

    logger.log('create_label(END)');
}


//
//  Delete an image and its children from the database.
//
//  Parameters:
//  
//      label : string : required.
//

function delete_image(label) {
    logger.log('delete_image(START)');
    logger.log('delete_image(): label = ' + label);

    // Determine if image already exists.

    var query1 = "SELECT id FROM images " +
                 "WHERE (label = '" + label + "')";

    logger.log('delete_image(): query1 = ' + query1);

    const rows1 = db_con.query(query1);
    logger.log('delete_image(): rows1.length() = ' + rows1.length);
    assert (rows1.length == 0 || rows1.length == 1);

    // If image does not exist, then nothing to do.

    if (rows1.length == 0) {
        logger.log('delete_image(): rows1.length = 0');
        logger.log('delete_image(END)');
        return;
    }

    // One image exists, delete the image and its children.

    image_id = rows1[0]['id'];
    logger.log('delete_image(): image_id = ' + image_id);

    // Get the Label ID.

    var query2 = "SELECT id FROM labels WHERE (image_id = " + image_id + ")";
    logger.log('delete_image(): query2 = ' + query2);

    const rows2 = db_con.query(query2);
    logger.log('delete_image(): rows2.length() = ' + rows2.length);

    for (index in rows2) {
        label_id = rows2[index]['id'];
        logger.log('delete_image(): label_id = ' + label_id);

        // Delete from aliases table.

        var query3 = "DELETE FROM aliases WHERE (label_id = " + label_id + ")";

        logger.log('delete_image(): query3 = ' + query3);
        db_con.query(query3);

        // Delete from categories table.

        var query4 = "DELETE FROM categories WHERE (label_id = " + label_id + 
                     ")";

        logger.log('delete_image(): query4 = ' + query4);
        db_con.query(query4);

        // Delete from instances table.

        var query5 = "DELETE FROM instances WHERE (label_id = " + label_id + 
                     ")";

        logger.log('delete_image(): query5 = ' + query5);
        db_con.query(query5);

        // Delete from parents table.

        var query6 = "DELETE FROM parents WHERE (label_id = " + label_id + ")";

        logger.log('delete_image(): query6 = ' + query6);
        db_con.query(query6);
    }

    // Delete from labels table.

    var query7 = "DELETE FROM labels WHERE (image_id = " + image_id + ")";

    logger.log('delete_image(): query7 = ' + query7);
    db_con.query(query7);

    // Delete from images table.

    var query8 = "DELETE FROM images WHERE (id = " + image_id + ")";

    logger.log('delete_image(): query8 = ' + query8);
    db_con.query(query8);

    // Done.

    logger.log('delete_image(END)');
}


//
//  Write data to a file in create mode.
//
//  Arguments:
//    file_name : string.
//    file_data : string.
//

function file_write(file_name, file_data) {
    console.log('file_write(START)');
    console.log('file_write(): file_name = ' + file_name);
    console.log('file_write(): file_data = ' + file_data);

    fs.writeFileSync(file_name, file_data);

    console.log('file_write(END)');
}


//
//  Read data from a url.
//
//  Return url data.
//  
//  Arguments:
//    url_name : string.
//

function get_data_from_url(url_name) {
    logger.log('get_data_from_url(START)');
    logger.log('get_data_from_url(): url_name = ' + url_name);

    var url_data = "TEST";

    fetch(url_name)
        .then((response) => {
            const p = Promise.resolve(response.text());

            p.then(value => {
                url_data = value;
                // console.log('get_data_from_url(): text = ' + value);
            }).catch(err => {
                console.log('get_data_from_url(): ERROR = ' + err);
            });
        })

    logger.log('get_data_from_url(END)');
    return url_data;
}


//
//  Service the GET "/images&objects=" query.
//
//  Return specific image metadata.
//  
//  Arguments:
//    response = HTTP Response ptr for user output.
//    url = url.
//

function get_image_objects(response, url) {
    logger.log('get_image_objects(START)');
    logger.log('get_image_objects(): url = ' + url);

    const new_url = url.replaceAll('"', '');
    logger.log('get_image_objects() new_url = ' + new_url);

    const words = new_url.split('=');
    logger.log('get_image_objects() words = ' + words);
    assert(words.length == 2);

    const labels = words[1].split(',');
    logger.log('get_image_objects() labels = ' + labels);

    // Construct the SELECT query.

    var query = 'SELECT DISTINCT image_id FROM labels WHERE (';

    for (var index in labels) {
        logger.log('get_image_objects() index = ' + index);
        logger.log('get_image_objects() label = ' + labels[index]);

        if (index == 0) 
            query += 'Name = "' + labels[index] + '"';
        else 
            query += ' OR Name = "' + labels[index] + '"';
    }

    query += ')';
    logger.log('get_image_objects(): query = ' + query);

    // Run the SELECT query.

    const rows = db_con.query(query);
    logger.log('get_image_objects(): rows.length() = ' + rows.length);

    var obj = JSON.parse('{"images": []}');

    for (var index in rows) {
        const row = rows[index];
        const image_id = row['image_id'];
        logger.log('get_image_objects() image_id = ' + image_id);

        const obj_image = print_image(response, image_id);
        obj["images"].push(obj_image);
    }

    // Done.

    const obj_out = JSON.stringify(obj, null, 4);
    response.write(obj_out);
    response.end();

    logger.log('get_image_objects(END)');
}


//
//  Service the GET "/images" query.
//
//  Return all image metadata.
//  
//  Arguments:
//    response = HTTP Response ptr for user output.
//

function get_images(response) {
    logger.log('get_images(START)');

    // Run the SELECT query.

    var query = "SELECT id FROM images ORDER BY id";
    logger.log('get_images(): query = ' + query);

    const rows = db_con.query(query);
    logger.log('get_images(): rows.length() = ' + rows.length);

    // Construct JSON response.

    var obj = JSON.parse('{"images": []}');

    for (var index in rows) {
        row = rows[index]
        const obj_image = print_image(response, row['id']);
        obj["images"].push(obj_image);
    }

    // Done.

    const obj_out = JSON.stringify(obj, null, 4);
    response.write(obj_out);
    response.end();

    logger.log('get_images(END)');
}


//
//  Service the GET "/images&objects=" query.
//
//  Return specific image metadata.
//  
//  Arguments:
//    response = HTTP Response ptr for user output.
//    url = url.
//

function get_one_image(response, url) {
    logger.log('get_one_image(START)');
    logger.log('get_one_image(): url = ' + url);

    var image_id = url.substring(8);
    logger.log('get_one_image(): image_id = ' + image_id);

    // Construct the SELECT query.

    var query = "SELECT COUNT(*) AS COUNT FROM images WHERE id = " + image_id;
    logger.log('get_one_image(): query = ' + query);

    // Run the SELECT query.

    const rows = db_con.query(query);
    const len = rows.length;
    logger.log('get_one_image(): rows.length() = ' + rows.length);
    assert(len == 0 || len == 1)

    if (len == 0) {
        response.statusCode = 405;
	response.statusMessage = "Unknown 'image_id'";
        response.end();
        logger.log('get_one_image(END)');
        return;
    }

    var row = rows[0];
    logger.log('get_one_image(): row[COUNT] = ' + row['COUNT']);

    if (row['COUNT'] != 1) {
        response.statusCode = 405;
	response.statusMessage = "Unknown 'image_id'";
        response.end();
        logger.log('get_one_image(END)');
        return;
    }

    const json_data = '{"image": {}}\n';
    var obj = JSON.parse(json_data);

    const obj_image = print_image(response, image_id);
    obj["image"].push(obj_image);

    // Done.

    const obj_out = JSON.stringify(obj, null, 4);
    response.write(obj_out);
    response.end();

    logger.log('get_one_image(END)');
}


//
//  Connect to the MySql database.
//  Sets the variable db_con.
//

function mysql_connect() {
    db_con = new mysql(
        {
            host : "127.0.0.1",
            user : "HEB",
            password : "$HEB$",
            database : "HEB"
        }
    );
}


//
//  Noop function.
//

function noop() {
}


//
//  Service the POST "/images" query.
//  I wanted to use the AWS S3 SDK to store a file, 
//  but I could not get it to work.
//  So used the "aws s3api post-object" instead to upload the file to AWS S3.
//  I wanted to use a javascript module to store a url, 
//  but I could not get it to work.
//  So I first stored the url data as a temp file and then use
//
//  Parameters:
//  
//      file : string : optional.
//      url : string : optional.
//      label : string : optional.
//      object_detect : {true|false} : optional.
//
//      Must have one of {file, url}.
//
//  Return new image metadata.
//  
//  Arguments:
//    body = request body.
//    url = URL.
//    response = HTTP Response object.
//

function post_images(body, url, response) {
    logger.log('post_images(START)');
    logger.log('post_images(): body = ' + body);
    logger.log('post_images(): url = ' + url);

    // Validate the method.

    assert (url == "/images")

    const obj = JSON.parse(body);

    for (var key in obj)
        logger.log('post_images(): parameter "' + key + '" = ' + obj[key]);

    var file_param = null;
    var label_param = null;
    var object_detect_param = false;
    var url_param = null;

    for (var key in obj)
        if (key == 'file') {
            file_param = obj['file'];
        } else if (key == 'label') {
            label_param = obj['label'];
        } else if (key == 'object_detect') {
            if (obj[key] == 'false')
                object_detect_param = false;
            else if (obj[key] == 'true')
                object_detect_param = true;
            else {
                const error = "Invalid Parameter 'object_detect' value = " +
		    obj[object_detect] + ".  Valid values = {true|false}.";
		response.statusCode = 405;
		response.statusMessage = error;
                response.end();
                logger.log('ERROR: post_images(): ' + error);
                logger.log('post_images(END)');
                return;
            }
            s3_object = obj['s3_object'];
        } else if (key == 'url') {
            url_param = obj['url'];
        } else {
	    error = "Unknown Parameter = " + key;
	    response.statusCode = 405;
	    response.statusMessage = error;
            response.end();
            logger.log('ERROR: post_images(): ' + error);
            logger.log('post_images(END)');
            return;
        }

    if (file_param) 
        logger.log('post_images(): file_param = ' + file_param);
    else
        logger.log('post_images(): file_param is null');

    if (label_param) 
        logger.log('post_images(): label_param = ' + label_param);
    else
        logger.log('post_images(): label_param is null');

    logger.log('post_images(): object_detect_param = ' + object_detect_param);

    if (url_param) 
        logger.log('post_images(): url_param = ' + url_param);
    else
        logger.log('post_images(): url_param is null');

    if ((file_param == null) && (url_param == null)) {
	error = "Must have one of the Parameters {file, url}.";
        response.statusCode = 405;
	response.statusMessage = error;
        response.end();
        logger.log('ERROR: post_images(): ' + error);
        logger.log('post_images(END)');
        return;
    }

    if ((file_param) && (url_param)) {
	error = "Must have one of the Parameters {file, url}.";
        response.statusCode = 405;
	response.statusMessage = error;
        response.end();
        logger.log('ERROR: post_images(): ' + error);
        logger.log('post_images(END)');
        return;
    }

    // If the parameter "object_detect" = false, then just store the image.

    if (object_detect_param == false) {
        logger.log('post_images(): object_detect = false');
        create_image_only(response, file_param, url_param, label_param);
        logger.log('post_images(END)');
        return;
    } else {
        logger.log('post_images(): object_detect = true');
    }

    // Copy the image to S3.

    if (file_param) {
        logger.log('exec(START): file_param');

        const cmd = 'aws s3api put-object --body "' + file_param + '" ' + 
                    '--bucket ' +
	            '"' + s3_config.bucket + '" ' +
                    '--key ' +
	            '"' + label_param + '"'; 

        logger.log('createServer(): cmd = ' + cmd); 

        exec(cmd, function (error, stdOut, stdErr) {
            logger.log('exec(START)');
            logger.log('exec(): error = ' + error);
            logger.log('exec(): stdOut = ' + stdOut);
            logger.log('exec(): stdErr = ' + stdErr);
            logger.log('exec(END)');
        });

        logger.log('exec(END file_param');
    } else if (url_param) {
        logger.log('exec(START): url_param');
        const new_file = tmp_file + label_param;

        const url_data = get_data_from_url(url_param, new_file);
        file_write(tmp_file + label_param, url_data);

        const cmd = 'aws s3api put-object --body "' + new_file + '" ' + 
                    '--bucket ' +
	            '"' + s3_config.bucket + '" ' +
                    '--key ' +
	            '"' + label_param + '"'; 

        logger.log('createServer(): cmd = ' + cmd); 

        exec(cmd, function (error, stdOut, stdErr) {
            logger.log('exec(START)');
            logger.log('exec(): error = ' + error);
            logger.log('exec(): stdOut = ' + stdOut);
            logger.log('exec(): stdErr = ' + stdErr);
            logger.log('exec(END)');
        });

        logger.log('exec(END): url_param');
    } else {
        assert(0);
    }

    // Run AWS Rekognition.

    const rekognition = new Rekognition({region: s3_config.region});

    const run = async () => {
        try {
            const data = await rekognition.detectLabels({
                Image: { 
                    S3Object: { 
                        Bucket: s3_config.bucket,
                        Name: label_param,
                    }
                }
                }).promise();

            create_image(response, file_param, url_param, data['Labels'], 
                         s3_config.region, s3_config.bucket, label_param, 
                         object_detect_param);
        } catch (err) {
	    response.statusCode = 500;
	    response.statusMessage = 
	        "rekognition.detectLabels() ERROR = " + err;
            response.end();
            logger.log('post_images(): ERROR = ' + err);
            logger.error(err);
        }
    };

    run();

    logger.log('post_images(END)');
}


//
//  Display all Aliases for a label.
//
//  Parameters:
//  
//  response : object : required.
//  label_id : int : required.
//

function print_aliases(response, label_id) {
    logger.log('print_aliases(START)');
    logger.log('print_aliases(): label_id = ' + label_id);

    // Query the Aliases Table.

    var query1 = "SELECT " +
                     "id, " +
                     "name " +
                 "FROM aliases " +
                 "WHERE (id = " + label_id + ")";

    logger.log('print_aliases(): query1 = ' + query1);
    const rows1 = db_con.query(query1);
    logger.log('print_aliases(): rows1.length() = ' + rows1.length);

    var obj = JSON.parse('{"Aliases": []}');

    if (rows1.length == 0) {
        logger.log('print_aliases(END) 1');
        return obj;
    }

    for (var index in rows1) {
        row = rows1[0]

        var alias = JSON.parse('{}');
        alias["Name"] = row["name"];
        obj["Aliases"].push(alias);
    }

    logger.log('print_aliases(END) 2');
    return obj;
}


//
//  Display all Categories for a label.
//
//  Parameters:
//  
//  response : object : required.
//  label_id : int : required.
//

function print_categories(response, label_id) {
    logger.log('print_categories(START)');
    logger.log('print_categories(): label_id = ' + label_id);

    // Query the Categories Table.

    var query1 = "SELECT " +
                     "id, " +
                     "name " +
                 "FROM categories " +
                 "WHERE (id = " + label_id + ")";

    logger.log('print_categories(): query1 = ' + query1);
    const rows1 = db_con.query(query1);
    logger.log('print_categories(): rows1.length() = ' + rows1.length);

    var obj = JSON.parse('{"Categories": []}');

    if (rows1.length == 0) {
        logger.log('print_categories(END) 1');
        return obj;
    }

    for (var index in rows1) {
        row = rows1[0]

        var category = JSON.parse('{}');
        category["Name"] = row["name"];
        obj["Categories"].push(category);
    }

    logger.log('print_categories(END) 2');
    return obj;
}


//
//  Display an image.
//
//  Parameters:
//      response : object : required.
//      image_id : int : required.
//      
//  Return: JSON Object = image.
//

function print_image(response, image_id) {
    logger.log('print_image(START)');
    logger.log('print_image(): image_id = ' + image_id);

    // Query the image.

    var query1 = "SELECT " +
                     "id, " +
                     "file_name, " +
                     "url_name, " +
                     "label, " +
                     "object_detect, " +
                     "store_time " +
                 "FROM images " +
                 "WHERE (id = " + image_id + ")";

    logger.log('print_image(): query1 = ' + query1);
    const rows1 = db_con.query(query1);
    logger.log('print_image(): rows1.length() = ' + rows1.length);
    assert (rows1.length == 1);
    row = rows1[0]

    const obj_out_1 = JSON.stringify(row, null, 4);
    logger.log('print_image(): row = ' + obj_out_1);

    var obj = JSON.parse('{}');
    obj["image_id"] = row["id"];

    if (row["file_name"])
        obj["file"] = row["file_name"];

    if (row["url_name"])
        obj["url"] = row["url_name"];

    obj["label"] = row["label"];
    obj["object_detect"] = row["object_detect"];
    obj["store_time"] = row["store_time"];

    const obj_out_2 = JSON.stringify(obj, null, 4);
    logger.log('print_image(): obj = ' + obj_out_2);

    if (row["object_detect"] == false) {
        logger.log('print_image(END)');
        return obj;
    }

    // Query the labels.

    var query2 = "SELECT " +
                     "id, " +
                     "name, " +
                     "confidence " +
                 "FROM labels " +
                 "WHERE (image_id = " + image_id + ")";

    logger.log('print_image(): query2 = ' + query2);
    const rows2 = db_con.query(query2);
    logger.log('print_image(): rows2.length() = ' + rows2.length);

    obj["labels"] = JSON.parse('[]');

    for (var index in rows2) {
        row = rows2[index];

        var label = JSON.parse('{}');

        label["Name"] = row['name'];
        label["Confidence"] = row['confidence'];

        // const instances = print_instances(response, row['id']);
        // label["Instances"] = instances;

        const parents = print_parents(response, row['id']);
        label["Parents"] = parents["Parents"];

        const aliases = print_aliases(response, row['id']);
        label["Aliases"] = aliases["Aliases"];

        const categories = print_categories(response, row['id']);
        label["Categories"] = categories["Categories"];

        obj["labels"].push(label);
    }

    // Done.

    logger.log('print_image(END)');
    return obj;
}


//
//  Display all Instances for a label.
//
//  Parameters:
//      response : object : required.
//      label_id : int : required.
//  
//  Returns: Response JSON object.
//

function print_instances(response, label_id) {
    logger.log('print_instances(START)');
    logger.log('print_instances(): label_id = ' + label_id);

    // Query the Instances Table.

    var query1 = "SELECT " +
                     "id, " +
                     "bb_width, " +
                     "bb_height, " +
                     "bb_left, " +
                     "bb_top, " +
                     "confidence " +
                 "FROM instances " +
                 "WHERE (id = " + label_id + ")";

    logger.log('print_instances(): query1 = ' + query1);
    const rows1 = db_con.query(query1);
    logger.log('print_instances(): rows1.length() = ' + rows1.length);

    var obj = JSON.parse('{"Instances": []}');

    if (rows1.length == 0) {
        logger.log('print_instances(END) 1');
        return obj;
    }

    for (var index in rows1) {
        row = rows1[0]

        var instance = JSON.parse('{}');

        var instance = JSON.parse('{"BoundingBox" : {}}');
        instance["BoundingBox"]["Width"] = row['bb_width'];
        instance["BoundingBox"]["Height"] = row['bb_height'];
        instance["BoundingBox"]["Left"] = row['bb_left'];
        instance["BoundingBox"]["Top"] = row['bb_top'];

        instance["Confidence"] = row["confidence"];

        obj["Instances"].push(instance);
    }

    // const data = JSON.stringify(obj);
    // logger.log('print_instances(): data() = ' + data);
    logger.log('print_instances(END) 2');
    return obj;
}


//
//  Display a object of HTTP headers.
//

function print_object(headers) {
    for (key in headers) 
        logger.log('    ' + key + ' : ' + headers[key]);
}


//
//  Display all Parents for a label.
//
//  Parameters:
//  
//  response : object : required.
//  label_id : int : required.
//

function print_parents(response, label_id) {
    logger.log('print_parents(START)');
    logger.log('print_parents(): label_id = ' + label_id);

    // Query the Parents Table.

    var query1 = "SELECT " +
                     "id, " +
                     "name " +
                 "FROM parents " +
                 "WHERE (id = " + label_id + ")";

    logger.log('print_parents(): query1 = ' + query1);
    const rows1 = db_con.query(query1);
    logger.log('print_parents(): rows1.length() = ' + rows1.length);

    var obj = JSON.parse('{"Parents": []}');

    if (rows1.length == 0) {
        logger.log('print_parents(END) 1');
        return obj;
    }

    for (var index in rows1) {
        row = rows1[0]

        const parent = JSON.parse('{}');
        parent["Name"] = row["name"];
        obj["Parents"].push(parent);
    }

    logger.log('print_parents(END) 2');
    return obj;
}


//
//  Create a HTTP server.
//

http.createServer((request, response) => 
{
    var start = new Date();
    logger.log('createServer(START) ' + start);

    const {headers, method, url} = request;

    logger.log('createServer(): headers = '); 
    print_object(headers);
    logger.log('createServer(): method = ' + method); 
    logger.log('createServer(): url = ' + url); 

    let body = [];

    request.on('error', (err) => {
        logger.error(err);
    }).on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        response.on('error', (err) => {
            logger.error(err);
        });

        var error_flag = false;

        body_str = Buffer.concat(body).toString();
	logger.log('createServer(): body = ' + body_str); 

        if (body.length != 0) {
	    logger.log('createServer(): body is not empty'); 
            const body_obj = JSON.parse(body_str);

            for (var key in body_obj) {
	        logger.log('createServer(): body parameter = ' + key); 
                const param = body_obj[key].trim();

                if (!param) {
	            const error = ('Null parameter "' + key + '"');
	            logger.log('ERROR: createServer(): ' + error);
		    response.statusCode = 405;
		    response.statusMessage = error;
    	            response.end();
                    error_flag = true;
	        }
            }
        }

	if (error_flag == false) try {
	    // Create Mysql Sync connection.

	    mysql_connect();

	    // Process the method.

            if (method == "GET") {
                if        (url == '/images') {
	            get_images(response);
                } else if (url.substring(0, 8) == '/images/') {
	            get_image(response, url);
                } else if (url.substring(0, 16) == '/images\&objects=') {
	            get_image_objects(response, url);
                } else {
	            logger.log('ERROR: createServer(): Unknown GET method = ' 
                                + url);
		    response.statusCode = 405;
		    response.statusMessage = "Unknown GET method";
    	            response.end();
	        }
            } else if (method == "POST") {
                if (url == '/images') {
	            post_images(body, url, response);
                } else {
	            logger.log('ERROR: createServer(): Unknown POST ' +
                                'method = ' + url);
    	            response.end();
	        }
            } else {
	        logger.log('ERROR: createServer(): Unknown method = ' + 
                            method);
		response.statusCode = 405;
		response.statusMessage = "Unknown method";
    	        response.end();
            }
 	} catch (ex) {
            logger.log("createServer(): " + ex.message);
    	    response.end();
	}
    });

    var end = new Date();
    logger.log('createServer(END): ' + end);
}).listen(8080); 

