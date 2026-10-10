from pydantic import BaseModel, Field, model_validator


class DeviceAssignment(BaseModel):
    ue_a_serial: str = Field(min_length=1)
    ue_b_serial: str = Field(min_length=1)

    @model_validator(mode="after")
    def unique_serials(self) -> "DeviceAssignment":
        if self.ue_a_serial == self.ue_b_serial:
            raise ValueError("UE-A and UE-B cannot share a serial")
        return self


class DeviceStatus(BaseModel):
    serial: str
    adb_state: str
    manufacturer: str | None = None
    model: str | None = None
    android: str | None = None
    battery_percent: int | None = None
    ip_address: str | None = None
    rat: str | None = None
    signal: str | None = None
    mobile_data_enabled: bool | None = None
    ims_registered: bool | None = None
    errors: dict[str, str] = Field(default_factory=dict)
