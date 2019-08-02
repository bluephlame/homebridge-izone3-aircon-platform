"use strict";
const izone_api = require('izoneapi');
var events = require('events');

const eventEmitter = new events.EventEmitter();


// const AirConditioner = require('./airconditioner');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  // console.log("homebridge API version: " + homebridge.version);

  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  
  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  homebridge.registerPlatform("homebridge-izone3-aircon-platform", "iZone3AirConPlatform", iZone3Platform, true);
}

function iZone3Platform(log, config, api) {
    log("iZone Platform Init");
    var platform = this;
    this.log = log;
    this.config = config;
    this.accessories = [];
    this.client = new izone_api();

    if (api) {
        // Save the API object as plugin needs to register new accessory via this object
        this.api = api;
        // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
        // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
        // Or start discover new accessories.
        this.api.on('didFinishLaunching', async function (){
          platform.log("DidFinishLaunching");
          var has_airconditioner = false;
          try{  
            await this.client.getIP();
            var zones = await platform.client.getActiveZones();

            for (const assesory of this.accessories) {
              if(assesory.ac.constructor.name == "ZoneThermostat")
              {
                var zone = await zones.find( async function(item) {
                  return assesory.context.zoneIndex == item.Index;
                });
                if(zone){
                  platform.log(`assesory already found ${zone.Name}`);
                  zones.splice(zones.indexOf(zone),1);
                }
              }
              else if(assesory.ac.constructor.name == "AirConditioner")
              {
                has_airconditioner = true;
              }
            }
            platform.log(`There are ${zones.length} new zones to add`);

            zones.forEach((zone) => {
              platform.log(`adding thermostat ${zone.Name} index:${zone.Index}`);
              platform.addThermostat(zone.Name,zone.Index);
            });
            if(!has_airconditioner){
              platform.log(`adding AirConditioner `);
              platform.addAirConditioner("AC");
            }

          } catch(err) {platform.log(err);}
        
        }.bind(this));
    }
}

iZone3Platform.prototype.addAirConditioner = function(name){
  this.log("Adding AirConditioner")
  var ac = new AirConditioner(this.log,name,this.client);
  this._addDevice (name,ac);
}


iZone3Platform.prototype.addThermostat = function(name,zoneIndex) {
  
  var ac = new ZoneThermostat(this.log,name,zoneIndex,this.client);
  this._addDevice (name,ac,zoneIndex);
}

iZone3Platform.prototype._addDevice = function(name,device,zoneIndex)
{
  this.log("Adding Thermostat");
    var platform = this;
    var uuid = UUIDGen.generate(name);

     var newAccessory = new Accessory(name, uuid);
    newAccessory.on('identify', function(paired, callback) {
      platform.log(newAccessory.name, "Identify!!!");
      callback();
    });
   

    var ac_Service = device.getServices();
    newAccessory.ac = device;
    newAccessory.context.deviceType = device.constructor.name;
    newAccessory.context.zoneIndex = zoneIndex;
    newAccessory.addService(ac_Service, name+'-thermo');

    this.accessories.push(newAccessory);
    this.api.registerPlatformAccessories("homebridge-izone3-aircon-platform", "iZone3AirConPlatform", [newAccessory]);
}

// Function invoked when homebridge tries to restore cached accessory.
// Developer can configure accessory at here (like setup event handler).
// Update current value.
iZone3Platform.prototype.configureAccessory = function(accessory) {
  this.log(accessory.displayName, `Configure Accessory!`);
  var platform = this;

  // console.log(accessory);

  this.log(`Loaded Type: ${accessory.context.deviceType} Loaded zone index: ${accessory.context.zoneIndex}` );
  if(accessory.context.deviceType == "ZoneThermostat")
  {
    var ac = new ZoneThermostat(platform.log,accessory.displayName,accessory.context.zoneIndex,platform.client);
    accessory.ac = ac;
    if (accessory.getService(Service.Thermostat)) {
      ac.registerServices(accessory.getService(Service.Thermostat));
    }
    ac.startReading();
  }
  else{
    var ac = new AirConditioner(platform.log,accessory.displayName,platform.client);
    accessory.ac = ac;
    if (accessory.getService(Service.HeaterCooler)) {
      ac.registerServices(accessory.getService(Service.HeaterCooler));
    }
    ac.startReading();

  }
  this.accessories.push(accessory);

  // Set the accessory to reachable if plugin can currently process the accessory,
  // otherwise set to false and update the reachability later by invoking 
  // accessory.updateReachability()
  accessory.reachable = true;

  accessory.on('identify', function(paired, callback) {
    platform.log(accessory.displayName, "Identify!!!");
    callback();
  });
}

/////////////////////////
///////////
class AirConditioner{

  constructor(log, name, client) {
      this.log = function(str){
        return log(`\x1b[33m[${this.name}]\x1b[0m:`,str);
      };
      this.name = name;
      this.currentTemperature = -22;
      this.currentDeviceState = 'Off';
      this.client = client;
  }
  

  //this is the loop that updates the Current value of the temp for the homekit service to return (in get Services)
  startReading() {
      const callback = () => {
          setTimeout(() => this.getReading(callback), 50000);
          };
      this.getReading(callback);
  }

  getReading(callback) {
          
      //here is wher we go off and read the value.
      this.client.getDuctTemp().then( temperature =>{
          this.currentTemperature = temperature;
          this.acService.setCharacteristic(Characteristic.CurrentTemperature, this.currentTemperature);
          this.log(`Current temparture is ${this.currentTemperature} in Duct`);
          return callback();
      })
      .catch(err =>{
          this.log(`get Duct Temp error :: ${err}`); 
      });

    //   this.client.getState().then( state => {
    //     this.log(`[${this.name}]Current state is ${state}`);
    //     var value;
    //     if(state =="on")
    //     {
    //       value = Characteristic.Active.ACTIVE;
    //     }
    //     else{
    //       value =Characteristic.Active.INACTIVE;
    //     }
    //     this.acService.getCharacteristic(Characteristic.Active).updateValue();
    //   } ) .catch(err =>{
    //     this.log.error(`get STATE error :: ${err}`); 
    // });

  }

  async getActive(callback) {
    try{
      var state = await this.client.getState();
      const isActive = (state === 'on');
      this.log(`[${this.name}] Current state is ${state} [${isActive}]`);
      callback(null, (isActive ? 1 :0));
    } catch(err) {
      this.log.error(`getActive error : ${err}`);
    };
  }

  async setActive(isActive, callback){
    try{
      this.log(`[AC] set active ${isActive}`);
      eventEmitter.emit('acSetActive',isActive);
      if(isActive)  
      {
        this.log(`Turning AC on`);
        await this.client.setOn();
      }
      else{
        this.log(`Turning AC off`);
        await this.client.setOff();
      }
      callback();
    } catch(err){ 
        this.log.error(`[AC] Set Active error : ${err}`);
    }
  }

  async getTargetHeaterCoolerState(callback){
    var result = await this.client.getHeaterCoolerState();
    this.log(`[${this.name}] Get heating state ${result}`);
    return callback(null,result);
  }

  //sets the current heating target temperature
//   Characteristic.TargetHeaterCoolerState.AUTO = 0;
// Characteristic.TargetHeaterCoolerState.HEAT = 1;
// Characteristic.TargetHeaterCoolerState.COOL = 2;
  async setTargetHeaterCoolerState(state,callback){
    this.log(`[${this.name}] setting AC threshold to ${state}`);
    eventEmitter.emit('TargetHeaterCoolerChange',state);
    console.log('event emmited');
    if(state == Characteristic.TargetHeaterCoolerState.AUTO)
      this.client.setSystemMode("auto")    
    else if(state == Characteristic.TargetHeaterCoolerState.HEAT)
      this.client.setSystemMode("heat")
    else if( state == Characteristic.TargetHeaterCoolerState.COOL)
      this.client.setSystemMode("cool");
    callback();
  }

  setCurrentHeaterCoolerState(state,callback){
    // Characteristic.CurrentHeaterCoolerState.INACTIVE = 0;
    // Characteristic.CurrentHeaterCoolerState.IDLE = 1;
    // Characteristic.CurrentHeaterCoolerState.HEATING = 2;
    // Characteristic.CurrentHeaterCoolerState.COOLING = 3;
    this.log(`in setCurrentHeaterCoolerState`);

    switch (state) {
      case Characteristic.CurrentHeaterCoolerState.OFF:
          state = "OFF"
          break
      case Characteristic.CurrentHeaterCoolerState.COOL:
          state = "COOL"
          break
      case Characteristic.CurrentHeaterCoolerState.HEAT:
          state = "HEAT"
          break
      case Characteristic.CurrentHeaterCoolerState.AUTO:
          state = "AUTO"
          break
    }
    this.log(state);
    callback();
  }

  async getCurrentHeaterCoolerState(callback){
    this.log(`in getCurrentHeaterCoolerState`);

    var state = await this.client.getHeaterCoolerState();
    this.log(`[${this.name}] AC state is ${state}`)

    if(state == "heat")
      callback(null, Characteristic.CurrentHeaterCoolerState.HEATING);
    else if(state == "cool")
      callback(null, Characteristic.CurrentHeaterCoolerState.COOLING);
    else if(state == "off")
      callback(null, Characteristic.CurrentHeaterCoolerState.INACTIVE);
    else 
      callback(null, Characteristic.CurrentHeaterCoolerState.IDLE);
  }

  async getHeatingThresholdTemperature(callback){
    this.log(`in getHeatingThresholdTemperature`);
    var targetTemp = await this.client.getACTarget();
    callback(null,targetTemp);
    
  }

  async setHeatingThresholdTemperature(state,callback){
    this.log(`in setHeatingThresholdTemperature state:[${state}]`);
    await this.client.setACTarget(state);
    callback();
  }

getServices() {
  this.log(`in Get Services for zone`);
  let informationService = new Service.AccessoryInformation();
  informationService
      .setCharacteristic(Characteristic.Manufacturer, "My AirCon")
      .setCharacteristic(Characteristic.Model, "iZone3")
      .setCharacteristic(Characteristic.SerialNumber, "123-456-789");

  this.acService = new Service.HeaterCooler(this.name);
  
  return this.registerServices(this.acService);;
}

registerServices(service){
  service
  .getCharacteristic(Characteristic.Active)
    .on('get', this.getActive.bind(this))
    .on('set', this.setActive.bind(this));

    service
    .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
    .on('get', this.getCurrentHeaterCoolerState.bind(this))
    .on('set', this.setCurrentHeaterCoolerState.bind(this))
    service
    .getCharacteristic(Characteristic.CurrentTemperature)

    .on('get', (callback) => {
      callback(null, this.currentTemperature);
    });

    service
    .getCharacteristic(Characteristic.TargetHeaterCoolerState)
    .on('get', this.getTargetHeaterCoolerState.bind(this))
    .on('set', this.setTargetHeaterCoolerState.bind(this))
    .setProps({
      format: Characteristic.Formats.UINT8,
      maxValue: 2,
      minValue: 0,
      validValues: [0,1,2],
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    });

    service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
    .setProps({
      minValue: 16,
      maxValue: 30,
      minStep: .5
    })
     .on('get', this.getHeatingThresholdTemperature.bind(this))
     .on('set', this.setHeatingThresholdTemperature.bind(this))

     service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
    .setProps({
      minValue: 16,
      maxValue: 30,
      minStep: .5
    })
     .on('get', this.getHeatingThresholdTemperature.bind(this))
     .on('set', this.setHeatingThresholdTemperature.bind(this))
    
    service
    .getCharacteristic(Characteristic.Name)
    .on('get', callback => {
      callback(null, this.name);
    });
    this.acService = service;
    return service;
}
}
// Service.HeaterCooler = function(displayName, subtype) {
//   Service.call(this, displayName, '000000BC-0000-1000-8000-0026BB765291', subtype);

//   // Required Characteristics
//   this.addCharacteristic(Characteristic.Active);
//   this.addCharacteristic(Characteristic.CurrentHeaterCoolerState);
//   this.addCharacteristic(Characteristic.TargetHeaterCoolerState);
//   this.addCharacteristic(Characteristic.CurrentTemperature);

//   // Optional Characteristics
//   this.addOptionalCharacteristic(Characteristic.LockPhysicalControls);
//   this.addOptionalCharacteristic(Characteristic.Name);
//   this.addOptionalCharacteristic(Characteristic.SwingMode);
//   this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
//   this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
//   this.addOptionalCharacteristic(Characteristic.TemperatureDisplayUnits);
//   this.addOptionalCharacteristic(Characteristic.RotationSpeed);
// };

class ZoneThermostat{

  constructor(log, name,zone, client,airConditioner) {
    this.log = function(str){
      return log(`\x1b[33m[${this.name}]\x1b[0m:`,str);
    };
      this.name = name;
      this.zone = zone;
      this.currentTemperature = -22;
      this.currentDeviceState = 'Off';
      this.client = client;

      this.onACTargetHeaterCoolerChange = this.onACTargetHeaterCoolerChange.bind(this);
      this.onACSetActive = this.onACSetActive.bind(this);
      eventEmitter.on('TargetHeaterCoolerChange',this.onACTargetHeaterCoolerChange);
      eventEmitter.on('acSetActive',this.onACSetActive);
  }

  //this is the loop that updates the Current value of the temp for the homekit service to return (in get Services)
  startReading() {
      const callback = () => {
          setTimeout(() => this.getReading(callback), 50000);
          };
      this.getReading(callback);
  }

  getReading(callback) {
          
      //here is wher we go off and read the value.
      this.client.getZoneTemp(this.zone).then( temperature =>{
          this.currentTemperature = temperature;
          this.acService.setCharacteristic(Characteristic.CurrentTemperature, this.currentTemperature);
          // this.log.info(`Current temparture is ${this.currentTemperature} in zone ${this.zone}`);
          callback();
      })
      .catch(err =>{
          this.log.error(`getreading error :: ${err}`); 
      });
  }

  getTargetTemperature(callback){
    this.log(`[${this.name}] Get TargetTemperature`)
    this.client.getZoneTarget(this.zone).then(result =>{
      this.log(`[${this.name}] getZoneTARGET : ${result}`);
      return callback(null,result);
    }).catch(err =>{this.log(err)});
  }

  //sets the current heating target temperature
  setTargetTemperature(state,callback){
    this.log(`setTargetTemperature ${state}`)
    this.client.setZoneTarget(this.zone,state).then(result=>{
      this.log(`setting zone ${this.zone} to ${state}`)
      callback();
    })
  }



  getCoolingThresholdTemperature(callback){
    this.log(`in getCoolingThresholdTemperature`);
    //if cooling setpoint as lowest value, otherwise +5
    var temperature =  this.client.getZoneTargetTemperature(this.zone)
    callback(null,temperature);
  }
  setCoolingThresholdTemperature(state,callback){
    this.log(`in setCoolingThresholdTemperature ${state}`);
    this.client.setZoneTarget(this.zone,state);
    callback()
  }
  getHeatingThresholdTemperature(callback){
    this.log(`in getHeatingThresholdTemperature`);
    var temperature =  this.client.getZoneTargetTemperature(this.zone)
    callback(null,temperature);
  }
  setHeatingThresholdTemperature(state,callback){
    this.log(`in setHeatingThresholdTemperature ${state}`);
    this.client.setZoneTarget(this.zone,state);
    callback()  
  }
  onACSetActive(targetACActiveState){
    this.acTargetSetActive = targetACActiveState;
  }

  //Heater Cooling state
  onACTargetHeaterCoolerChange(targetACState){
    var thermostatState = this.acService.getCharacteristic(Characteristic.TargetHeatingCoolingState);
//if the states are heat or cool we change to the new state from the AC
//if Thermostat is off we keep it off
//if the incoming AC state is off, we dont change.
    // caching state to object
    this.acTargetHeaterCoolerState = targetACState;

// Characteristic.TargetHeatingCoolingState.OFF = 0;
// Characteristic.TargetHeatingCoolingState.HEAT = 1;
// Characteristic.TargetHeatingCoolingState.COOL = 2;
// Characteristic.TargetHeatingCoolingState.AUTO = 3;
    console.log(`[${this.name}]Current state is ${thermostatState.value} new state of AC is ${targetACState} and Active state is ${this.acTargetSetActive}`);
    if(thermostatState.value == Characteristic.TargetHeatingCoolingState.HEAT||
       thermostatState.value == Characteristic.TargetHeatingCoolingState.COOL||
       thermostatState.value == Characteristic.TargetHeatingCoolingState.AUTO){
      console.log(`[${this.name}]should change state here`);
      if(this.acTargetSetActive != Characteristic.Active.INACTIVE)
      {

//   Characteristic.TargetHeaterCoolerState.AUTO = 0;
// Characteristic.TargetHeaterCoolerState.HEAT = 1;
// Characteristic.TargetHeaterCoolerState.COOL = 2;

        //remapping auto as it changes across these states
        targetACState = (targetACState == Characteristic.TargetHeaterCoolerState.AUTO ? Characteristic.TargetHeatingCoolingState.AUTO:targetACState)

        this.acService.setCharacteristic(Characteristic.TargetHeatingCoolingState,targetACState);
      }
      console.log(`[${this.name}] AC is off, dont change`);
      //else dont change.
    }
    else if(thermostatState.value == Characteristic.TargetHeatingCoolingState.OFF){
      console.log(`[${this.name}]thermastat is off (keeping it off)`) 
    }
    else{
      console.log(`[${this.name}]should remain unchanged`);
    }
  }

  getCurrentHeatingCoolingState(callback){
    this.log(`in getCurrentHeatingCoolingState`);
    callback(null,0);
  }
  setCurrentHeatingCoolingState(state,callback){
    this.log(`in setCurrentHeatingCoolingState ${state}`);
    callback()
  }
  getTargetHeatingCoolingState(callback){
    this.log(`in getTargetHeatingCoolingState`);
    var mode = this.client.getZoneTarget(this.zone);
    if(mode == 'close')
      callback(null,Characteristic.TargetHeatingCoolingState.OFF);
    else
      callback(null,Characteristic.TargetHeatingCoolingState.AUTO);
  }

  setTargetHeatingCoolingState(state,callback){
    this.log(`in setTargetHeatingCoolingState ${state}`);    
    if(state == Characteristic.TargetHeatingCoolingState.OFF){
      this.client.setZoneTarget(this.zone,'close');
    }
    else{
      var Temperature = this.acService.getCharacteristic(Characteristic.HeatingThresholdTemperature).value
      this.client.setZoneTarget(this.zone,Temperature);
    }
    callback();
  }

getServices() {
  this.log(`in Get Services for zone`);
  let informationService = new Service.AccessoryInformation();
  informationService
      .setCharacteristic(Characteristic.Manufacturer, "iZone3")
      .setCharacteristic(Characteristic.Model, "iZone3")
      .setCharacteristic(Characteristic.SerialNumber, "123-456-789");

  this.acService = new Service.Thermostat(this.name);
  
  return this.registerServices(this.acService);;
}

registerServices(service){

    service
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', (callback) => {
      callback(null, this.currentTemperature);
    });

    // service
    // .getCharacteristic(Characteristic.TargetTemperature)
    // .setProps({
    //   minValue: 16,
    //   maxValue: 30,
    //   minStep: .5
    // })
    // .on('get',this.getTargetTemperature.bind(this))
    // .on('set',this.setTargetTemperature.bind(this))

    service
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this))
      .on('set', this.setCurrentHeatingCoolingState.bind(this));  

    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .on('get',this.getTargetHeatingCoolingState.bind(this))
    .on('set',this.setTargetHeatingCoolingState.bind(this))   
    .setProps({
      format: Characteristic.Formats.UINT8,
      maxValue: 3,
      minValue: 0,
      validValues: [0,1,2,3],
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    }); 

    service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
    .on('get',this.getHeatingThresholdTemperature.bind(this))
    .on('set',this.setHeatingThresholdTemperature.bind(this))
    .setProps({
      minValue: 16,
      maxValue: 30,
      minStep: .5
    })

    service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
    .on('get',this.getCoolingThresholdTemperature.bind(this))
    .on('set',this.setCoolingThresholdTemperature.bind(this))
    .setProps({
      minValue: 16,
      maxValue: 30,
      minStep: .5
    })
    
    service
    .getCharacteristic(Characteristic.Name)
    .on('get', callback => {
      callback(null, this.name);
    });
    this.acService = service;
    return service;
}
}

// Service.Thermostat = function(displayName, subtype) {
//   Service.call(this, displayName, '0000004A-0000-1000-8000-0026BB765291', subtype);

//   // Required Characteristics
//   this.addCharacteristic(Characteristic.CurrentHeatingCoolingState);
//   this.addCharacteristic(Characteristic.TargetHeatingCoolingState);
//   this.addCharacteristic(Characteristic.CurrentTemperature);
//   this.addCharacteristic(Characteristic.TargetTemperature);
//   this.addCharacteristic(Characteristic.TemperatureDisplayUnits);

//   // Optional Characteristics
//   this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
//   this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
//   this.addOptionalCharacteristic(Characteristic.Name);
// };

// Characteristic.CurrentHeatingCoolingState.OFF = 0;
// Characteristic.CurrentHeatingCoolingState.HEAT = 1;
// Characteristic.CurrentHeatingCoolingState.COOL = 2;

// The value property of TargetHeatingCoolingState must be one of the following:
// Characteristic.TargetHeatingCoolingState.OFF = 0;
// Characteristic.TargetHeatingCoolingState.HEAT = 1;
// Characteristic.TargetHeatingCoolingState.COOL = 2;
// Characteristic.TargetHeatingCoolingState.AUTO = 3;