from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Responses serialise as camelCase (matching the frontend types); requests accept either case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True, serialize_by_alias=True)


class ErrorBody(ApiModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody
