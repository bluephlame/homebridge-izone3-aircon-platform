class AirConditioner{

    constructor(log, name,zone, client) {
        this.log = log;
        this.name = name;
        this.zone = zone;
        this.currentTemperature = -22;
        this.currentDeviceState = 'Off';
        this.client = client
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
            this.log.info(`Current temparture is ${this.currentTemperature} in zone ${this.zone}`);
            return callback();
        })
        .catch(err =>{
            this.log.error(`getreading error :: ${err}`); 
        });
    }

    getActive(callback) {
      this.client.getState().then( state => {
        this.log(`Current state is ${state}`);
        const isActive = state === 'on';
        return callback(null, isActive);
      })
      .catch(err=>{
        this.log.error(`getActive error : ${err}`);
      });
    }

    setActive(isActive, callback){
      this.log("in is active");
      this.log(isActive);
      if(isActive)  
      {
        this.log(`Turning AC on`);
        this.client.setOn().then(result =>
          {
            this.log(`AC turned on`);
            this.acService.getCharacteristic(Characteristic.Active).updateValue(1);
            return callback(result);
          }
        ).catch( err =>{
          this.log.error(`getActive error : ${err}`);
        });
      }
      else{
        this.log(`Turning AC off`);
        this.client.setOff().then(result =>{
          this.log('AC turned off');
          this.acService.getCharacteristic(Characteristic.Active).updateValue(0);
          return callback(result);
          }).catch( err =>{
          this.log.error(`getActive error : ${err}`);
        })
      }
    }

    getCurrentState(callback){
      this.log(`get heating cooling state`)
      callback(null,0);
    }

    setCurrentState(state,callback)
    {
      callback(null,state);
    }

    getCurrentHeatingThreshold(callback){
      this.log(`get heating threshold`)
      this.client.getZoneTarget(this.zone).then(result =>{
        this.log(`getZoneTemperature : ${result}`);
        return callback(null,result);
      })
    }

    //sets the current heating target temperature
    setCurrentHeatingThreshold(state,callback){
      this.log(`set heating threshold ${state}`)
      this.client.setZoneTarget(this.zone,state).then(result=>{
        this.log(`setting zone ${this.zone} to ${state}`)
        return callback(null,state);
      })
    }

  getServices() {
    // this.log(`in Get Services for zone ${Service}`);
    let informationService = new Service.AccessoryInformation();
    informationService
        .setCharacteristic(Characteristic.Manufacturer, "My  AirCon")
        .setCharacteristic(Characteristic.Model, "iZone3")
        .setCharacteristic(Characteristic.SerialNumber, "123-456-789");
  
    this.acService = new Service.HeaterCooler(this.name);
   
    this.acService
    .getCharacteristic(Characteristic.Active)
      .on('get', this.getActive.bind(this))
      .on('set', this.setActive.bind(this));

    this.acService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', (callback) => {
        callback(null, this.currentTemperature);
      });

      this.acService
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .on('get', this.getCurrentState.bind(this))
      .on('set', this.setCurrentState.bind(this));

      this.acService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 16,
        maxValue: 30,
        minStep: .5
      })
      .on('get',this.getCurrentHeatingThreshold.bind(this))
      .on('set',this.setCurrentHeatingThreshold.bind(this))
      
      
      this.acService
      .getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.name);
      });

    return this.acService;
  }
}
module.exports = AirConditioner;