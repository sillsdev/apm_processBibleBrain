import { SQSClient } from "@aws-sdk/client-sqs";
import AWS from 'aws-sdk';

const queue = process.env.SIL_TR_BIBLEBRAIN_QUEUE;
const bucket = process.env.SIL_TR_USERFILES_BUCKET;
const host = process.env.SIL_TR_HOST;
const stagepath = process.env.SIL_TR_URLPATH;
const Key = process.env.SIL_TR_BIBLEBRAIN;

const Domain = "https://4.dbt.io/api/";
const Folder = "biblebrain";
const s3 = new AWS.S3();

export async function handler(event, context) {
  console.log('Here we are', event.Records.length);
  var sqs = new SQSClient();   
  
  async function fileExists(key)
  {
    try {
      // Check if the file already exists in S3
      await s3.headObject({ Bucket: bucket, Key: key }).promise();
      return true;
  } catch (error) {
      if (error.code !== 'NotFound') {
          // If the error is not a NotFound error, log it and return an error response
          console.error('Error checking file existence:', error);
      }
      return false;
  }  }
  async function putFile(key, contenttype, stream) {
    try {
      var params = {
        Bucket: bucket,
        Key: key,
        Body: stream,
        ContentType: contenttype,
      };
      //const data = await s3.send(new PutObjectCommand(uploadParams));
      var x = await s3.putObject(params).promise();
      console.log(x);
      return `https://${bucket}.s3.amazonaws.com/${key}`;
    } catch (err) {
      console.error("Error uploading file to s3", err);
      throw err;
    }
  }
  function generatePresignedUrl(objectKey) {
    const params = {
    Bucket: bucket,
    Key: objectKey,
    Expires: 60, // URL expiration time in seconds
    };
    
    try {
    const url = s3.getSignedUrl('putObject', params);
    return url;
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      throw error;
    }
  }
  async function BibleBrainApi(path, params)
  {
    if (params == undefined)
      params = new URLSearchParams();
    params.append('v', '4');
    params.append('key', Key);
    let uri = `${Domain}${path}?${params}`;
    try {
    var response = await fetch(uri);
    if (response.ok) {
      return await response.json();
    }
    else console.log(`${uri} response error ${response.statusText}`);
    } catch (e)
    {
      console.log("fetch error", e);
    }
  }

  async function createSectionResource(desc, seq, mediafileId, sectionId, passageId, orgWorkflowStepId)
  {
    const data = {
      "data": {
        "type":"sectionresources",
        "attributes": {
            "description":desc,
            "sequence-num": seq,
            "mediafile-id": mediafileId,
            "section-id": sectionId,
            "passage-id": passageId,
            "org-workflow-step-id": orgWorkflowStepId
        }
      }
    };
    var params = {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.api+json',
        'authorization': 'Bearer ' +  info.Token
      },
      body: JSON.stringify(data)
    };
    let uri = `https://${host}${stagepath}/api/sectionresources`;
     var response = await fetch(uri, params);
    if (response.ok) {
      var rec = await response.json();
      console.log('post', uri, rec.data.id);
      return rec.data;
    }
    else console.log(`${uri} response error ${response.statusText}`);
    return undefined;
  }
  async function createMedia(originalFile, contentType, duration, desc, passageId, planId,
    artifacttypeId, lang, s3file, folder, artifactcategoryId, sourceMediaId, segments) {

      var url =  generatePresignedUrl(`${folder}/${s3file}`);
      const data = {
        "data": {
          "type":"mediafiles",
          "attributes": {
              "version-number":1,
              "original-file":originalFile,
              "topic": desc,
              "content-type":contentType,
              "eaf-url":"Audio Attached",
              "date-created":"2024-10-25T01:39:47.918Z",
              "performed-by":"",
              "duration": duration,
              "publish-to":"{}",
              "languagebcp47": lang,
              "s3file": s3file,
              "s3folder": folder,
              "segments": segments ?? "{}",
              "audio-url": url,
              "link":false,
              "artifact-type-id": artifacttypeId,
              "artifact-category-id": artifactcategoryId,
              "plan-id": planId,
              "passage-id": passageId,
              "source-media-id": sourceMediaId
          }
        }
      };

      var params = {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.api+json',
          'authorization': 'Bearer ' +  info.Token
        },
        body: JSON.stringify(data)
      };
      let uri = `https://${host}${stagepath}/api/mediafiles`;
      var response = await fetch(uri, params);
      if (response.ok) {
        var rec = await response.json();
        console.log('post', uri, rec.data.id);
        return rec.data;
      }
      else 
        console.log(`${uri} response error ${response.status}`);
      return undefined;
  }
  function ContentType(codec, path)
   {
      let contentType = "audio/mp3";
      if (codec != undefined) {
        if (codec === "opus")
          contentType = "audio/webm";
      } else 
        contentType = path.indexOf(".mp3") > 0 ? "audio/mp3" : "audio/webm";
      return contentType;
  }
  async function UrlToS3(url, contenttype)
  {
      // Extract the file name from the URL
      const fileName = url.split('?')[0].split('/').pop();
      const key = `${Folder}/${fileName}`;
      console.log('UrlToS3 ', key, await fileExists(key));
      if (!(await fileExists(key)))
      {
        //fetch the file
        const response = await fetch(url);
        if (!response.ok) 
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        const buffer = await response.arrayBuffer(); // Convert response to ArrayBuffer
        response = await putFile(key, contenttype, Buffer.from(buffer));
        if (response) return fileName;
        return undefined;
      } else { 
        //console.log('file exists on s3'); 
        return fileName;
      }
  }
  async function getMedia(plan, filename, segments) {
      // options for API request
      var params = {
         method: "GET",
         headers: {
          'authorization': 'Bearer ' + info.Token
        },
      };
      var uri = `https://${host}${stagepath}/api/mediafiles/fromfile/${plan}/${encodeURI(filename)}`;
      if (segments) uri += `/${encodeURI(segments)}`;
      try {
        var response = await fetch(uri, params);
        if (response.ok) {
          var data = await response.json();
          console.log(uri, data.data.id);
          return data.data;
        } else console.log(`${uri} response error ${response.statusText}`);
      } catch (err)
      {
        console.log(err);
      }
        return undefined;     
  }
  
  async function BibleBrainInfo(info)
  {
    var fs = await BibleBrainApi(`bibles/filesets/${info.FilesetId}/${info.Book}/${info.Chapter}`, undefined);
    var data = fs.data[0];
    var url = data.path;
    var duration = data.duration??0;
    var contenttype = ContentType(info.Codec, url);
    var s3File = await UrlToS3(url,contenttype);
    return {duration, contenttype, s3File, url};
  }
  async function createGeneralResource(info) {
    var bb = await BibleBrainInfo(info);
    var existing = await getMedia(info.PlanId, bb.s3File);
    if (existing) return existing;
    return await createMedia(bb.url.split("?")[0], bb.contenttype, bb.duration, info.Desc, undefined, 
        info.PlanId, info.ArtifactTypeId, info.Lang, bb.s3File, Folder, 
        info.ArtifactCategoryId, undefined, undefined);
  }
  function Segments( start, end ) {
    var ri = [{start, end}];
    return JSON.stringify([{ name: "ProjRes", regionInfo: ri}], null, 0);
  }
  function GetStartEnd (startv, endv, timing, duration)
  {
      var startt =  timing.find(t => t.verse_start == startv.toString());
      var endt = timing.find(t => t.verse_start == (endv+1).toString());
      var ret = [ startt?.timestamp??0, endt?.timestamp??duration ];
      return ret;
  }
  async function createResource(info) {
    var bb = await BibleBrainInfo(info);
    var generalresource = await getMedia(info.PlanId, bb.s3File);
    if (!generalresource) throw new Error(`No General Resource for: ${bb.s3File}`);
    console.log('generalresource', generalresource.id);
    //get timing file for this fileset
    var fs = await BibleBrainApi(`timestamps/${info.FilesetId}/${info.Book}/${info.Chapter}`, undefined);
    if (fs)
    {
      var timing = fs.data;
      var se = GetStartEnd(info.Startverse, info.Endverse, timing, bb.duration);
      var segments = Segments(se[0], se[1]);
      var m = await getMedia(info.PlanId, bb.s3File, segments);
      if (!m)
      {
        m = await createMedia(bb.url.split("?")[0], bb.contenttype, bb.duration, info.Desc, info.PassageId, 
          info.PlanId, info.ArtifactTypeId, info.Lang, bb.s3File, Folder, 
          info.ArtifactCategoryId, parseInt(generalresource.id), segments);
        if (m)
          await createSectionResource(info.Desc, info.Sequence, parseInt(m.id), info.SectionId, info.PassageId, info.OrgWorkflowStepId);
      }
    }
  }
   
  try {
    for (const message of event.Records) {
      //console.log(message);
      const { body } =  message;
      if (typeof body === 'string') 
        var info = await JSON.parse(body);
      else
        info = body;
      console.log('info:', info);
      if (info.Type == 'general')
        await createGeneralResource(info);
      else
        await createResource(info);
  }}
  catch (err) {
      console.log(err.toString());
  } 
}
